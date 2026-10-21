import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
process.env.DATABASE_PATH = './data/nearby-' + randomUUID() + '.sqlite';
const { db } = await import('../lib/db');
const { nearby, wiki } = await import('../lib/places');
const originalFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = originalFetch;
  db.close();
});
test('близкие кадры используют один запрос, расстояния считаются для каждого кадра, сбой не кешируется', async () => {
  let calls = 0,
    charged = 0,
    fail = false;
  globalThis.fetch = async () => {
    calls++;
    if (fail) return new Response('', { status: 502 });
    return Response.json({
      query: {
        geosearch: [{ pageid: 1, title: 'Музей тест', lat: 40, lon: 45 }],
      },
    });
  };
  const [a, b] = await Promise.all([
    nearby(40.00001, 45, () => charged++),
    nearby(40.00002, 45, () => charged++),
  ]);
  assert.equal(calls, 1);
  assert.equal(charged, 1);
  assert.ok(b[0].dist > a[0].dist);
  fail = true;
  await assert.rejects(wiki({ pageids: '999' }));
  fail = false;
  await nearby(40.00001, 45, () => charged++);
  assert.equal(calls, 4);
  assert.equal(charged, 1);
});

test('ошибка перегрузки внутри HTTP 200 повторяется и не превращается в пустые места', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return calls === 1
      ? Response.json({ error: { code: 'cirrussearch-too-busy-error' } })
      : Response.json({ query: { geosearch: [] } });
  };
  await wiki({ pageids: '999' });
  assert.equal(calls, 2);
  calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return Response.json({ error: { code: 'cirrussearch-too-busy-error' } });
  };
  await assert.rejects(wiki({ pageids: '999' }), /перегружен/);
  assert.equal(calls, 3);
});

test('обращения к Википедии выполняются последовательно', async () => {
  let active = 0,
    max = 0;
  globalThis.fetch = async () => {
    active++;
    max = Math.max(max, active);
    await new Promise((resolve) => setTimeout(resolve, 10));
    active--;
    return Response.json({ query: {} });
  };
  await Promise.all([
    wiki({ pageids: '1' }),
    wiki({ pageids: '2' }),
    wiki({ pageids: '3' }),
  ]);
  assert.equal(max, 1);
});

test('поиск фильтрует пакет по категориям и кеширует результат без лишних запросов', async () => {
  let calls = 0;
  globalThis.fetch = async (input) => {
    calls++;
    const url = new URL(String(input));
    if (url.searchParams.get('list') === 'geosearch')
      return Response.json({
        query: {
          geosearch: [
            {
              pageid: 101,
              title: 'Катастрофа Ту-104 во Внукове',
              lat: 12,
              lon: 23,
            },
            { pageid: 102, title: 'Внуково (район Москвы)', lat: 12, lon: 23 },
            { pageid: 103, title: 'Насосная улица', lat: 12, lon: 23 },
            { pageid: 104, title: 'Тюнель', lat: 12, lon: 23 },
            { pageid: 105, title: 'Музей авиации', lat: 12, lon: 23 },
            { pageid: 106, title: 'Неизвестная статья', lat: 12, lon: 23 },
            { pageid: 107, title: 'Памятник самолёту', lat: 12, lon: 23 },
          ],
        },
      });
    assert.equal(url.searchParams.get('prop'), 'categories|pageterms');
    assert.deepEqual(url.searchParams.get('pageids')?.split('|'), [
      '102',
      '103',
      '104',
      '106',
    ]);
    return Response.json({
      query: {
        pages: {
          102: { terms: { description: ['район Москвы'] } },
          103: {
            terms: { description: ['улица в Москве'] },
            categories: [{ title: 'Категория:Улицы Москвы' }],
          },
          104: { categories: [{ title: 'Категория:Фуникулёры Турции' }] },
          106: { title: 'Неизвестная статья' },
        },
      },
    });
  };
  assert.deepEqual(
    (await nearby(12, 23)).map((place) => place.pageid),
    [104, 105, 107],
  );
  await nearby(12.00001, 23);
  assert.equal(calls, 2);
});

test('описание загружается по странице без геопоиска, кешируется и проверяет расстояние для каждого фото', async () => {
  const { placeSummary, placeText } = await import('../lib/places');
  let calls = 0;
  globalThis.fetch = async (input) => {
    calls++;
    const url = new URL(String(input));
    assert.equal(url.searchParams.get('pageids'), '87654321');
    assert.equal(url.searchParams.has('list'), false);
    return Response.json({
      query: {
        pages: {
          '87654321': {
            title: 'Собор',
            extract: 'Собор — исторический храм города.',
            coordinates: [{ lat: 41.01, lon: 28.97 }],
          },
        },
      },
    });
  };
  await placeSummary(87654321, { lat: 41.01, lon: 28.97 });
  assert.equal(
    (await placeText(87654321)).description,
    'Собор — исторический храм города.',
  );
  await placeSummary(87654321, { lat: 41.011, lon: 28.97 });
  await assert.rejects(placeSummary(87654321, { lat: 45, lon: 35 }));
  assert.equal(calls, 1);
});

test('если главное фото отсутствует, берём фотографию статьи с Викисклада и кешируем её', async () => {
  const { placeImage } = await import('../lib/places');
  let calls = 0;
  globalThis.fetch = async (input) => {
    calls++;
    const url = new URL(String(input));
    if (url.searchParams.get('prop') === 'pageimages|images')
      return Response.json({
        query: {
          pages: {
            '386434': {
              images: [
                { title: 'Файл:Flag of Turkey.png' },
                { title: 'Файл:Commons-logo.svg' },
                { title: 'Файл:Golden Horn and Sultanahmet.jpg' },
              ],
            },
          },
        },
      });
    assert.equal(
      url.searchParams.get('titles'),
      'Файл:Golden Horn and Sultanahmet.jpg',
    );
    return Response.json({
      query: {
        pages: {
          '-1': {
            title: 'Файл:Golden Horn and Sultanahmet.jpg',
            imagerepository: 'shared',
            imageinfo: [
              {
                mime: 'image/jpeg',
                width: 1024,
                height: 320,
                thumburl: 'https://thumb.wikimedia.org/sultanahmet.jpg',
              },
            ],
          },
        },
      },
    });
  };
  assert.equal(
    await placeImage(386434),
    'https://thumb.wikimedia.org/sultanahmet.jpg',
  );
  assert.equal(
    await placeImage(386434),
    'https://thumb.wikimedia.org/sultanahmet.jpg',
  );
  assert.equal(calls, 2);
});
test('главное фото не требует запасного запроса; небезопасные и несвободные файлы не подставляются', async () => {
  const { placeImage } = await import('../lib/places');
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return Response.json({
      query: {
        pages: {
          '987650': {
            thumbnail: { source: 'https://upload.wikimedia.org/photo.jpg' },
          },
        },
      },
    });
  };
  assert.equal(
    await placeImage(987650),
    'https://upload.wikimedia.org/photo.jpg',
  );
  assert.equal(calls, 1);
  globalThis.fetch = async (input) => {
    if (new URL(String(input)).searchParams.has('pageids'))
      return Response.json({
        query: {
          pages: {
            '987651': {
              thumbnail: { source: 'https://example.com/bad.jpg' },
              images: [{ title: 'Файл:Local.jpg' }],
            },
          },
        },
      });
    return Response.json({
      query: {
        pages: {
          '1': {
            title: 'Файл:Local.jpg',
            imagerepository: 'local',
            imageinfo: [
              {
                mime: 'image/jpeg',
                width: 800,
                height: 600,
                thumburl: 'https://upload.wikimedia.org/local.jpg',
              },
            ],
          },
        },
      },
    });
  };
  assert.equal(await placeImage(987651), null);
});
