import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

process.env.DATABASE_PATH = './data/fallback-' + randomUUID() + '.sqlite';

const { db } = await import('../lib/db');

const { nearby } = await import('../lib/places');

const original = globalThis.fetch;

after(() => {
  globalThis.fetch = original;
  db.close();
});

test('недоступный русский геопоиск заменяется английским с возвратом русских статей и без повторного штурма', async () => {
  let russianSearches = 0;
  let englishSearches = 0;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    const p = url.searchParams;
    if (p.get('list') === 'geosearch') {
      if (url.hostname === 'ru.wikipedia.org') {
        russianSearches++;
        return Response.json({
          error: { code: 'cirrussearch-too-busy-error' },
        });
      }
      englishSearches++;
      return Response.json({
        query: {
          geosearch: [{ pageid: 10, title: 'Museum', lat: 41, lon: 44 }],
        },
      });
    }
    if (p.get('prop') === 'langlinks')
      return Response.json({
        query: { pages: { 10: { langlinks: [{ lang: 'ru', '*': 'Музей' }] } } },
      });
    assert.equal(url.hostname, 'ru.wikipedia.org');
    assert.equal(p.get('titles'), 'Музей');
    return Response.json({
      query: {
        pages: {
          20: {
            pageid: 20,
            title: 'Музей',
            coordinates: [{ lat: 41, lon: 44 }],
            categories: [{ title: 'Категория:Музеи' }],
          },
        },
      },
    });
  };
  const result = await nearby(41, 44);
  assert.equal(result[0].title, 'Музей');
  assert.equal(result[0].pageid, 20);
  await nearby(41.002, 44);
  assert.equal(russianSearches, 1);
  assert.equal(englishSearches, 2);
});
