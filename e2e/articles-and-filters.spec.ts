import { test, expect } from '@playwright/test';
import sharp from 'sharp';

test('all article surfaces follow site language and category filters retain canonical photo links', async ({
  page,
}) => {
  const image = await sharp({
    create: { width: 300, height: 200, channels: 3, background: '#c4d2e0' },
  })
    .png()
    .toBuffer();
  const trip = {
    id: 'article-locale',
    title: 'Наш Стамбул',
    description: '',
    destination: 'Стамбул',
    start: '2026-10-10',
    end: '2026-10-18',
    from: '2026-10-10',
    to: '2026-10-18',
    role: 'owner',
    sharing: false,
  };
  const specs = [
    ['Собор', 'Собор — достопримечательность Стамбула.', 'Cathedral'],
    ['Улица Банкалар', 'Улица Банкалар — улица в Стамбуле.', 'Bankalar Street'],
    ['Галата', 'Галата — исторический район Стамбула.', 'Galata'],
    ['Площадь Таксим', 'Таксим — площадь в Стамбуле.', 'Taksim Square'],
    ['Гюльхане', 'Гюльхане — городской парк Стамбула.', 'Gulhane Park'],
  ];
  const media = specs.map((_, i) => ({
    id: 'photo-' + (i + 1),
    name: 'IMG.jpg',
    title: 'Моя фотография',
    mime: 'image/jpeg',
    kind: 'photo',
    taken: '2026-10-11T10:00:00',
    user_id: 'owner',
    author: 'Автор',
    lat: 41.01,
    lon: 28.98,
    hidden: 0,
    missing: 0,
    revision: '1',
  }));
  const places = specs.map(([title, summary], i) => ({
    id: 'place-' + (i + 1),
    media_id: media[i].id,
    title,
    summary,
    url: 'https://ru.wikipedia.org/?curid=' + (i + 1),
    day: '2026-10-11',
    lat: 41.01,
    lon: 28.98,
    distance: 10,
  }));
  const reads: { id: number; language: string }[] = [];
  await page.route('**/api/me', (r) =>
    r.fulfill({
      json: { user: { id: 'owner', name: 'Автор' }, yandexEnabled: false },
    }),
  );
  await page.route('**/api/trips', (r) =>
    r.fulfill({ json: { trips: [trip] } }),
  );
  await page.route('**/api/trips/article-locale', (r) =>
    r.fulfill({
      json: {
        trip,
        media,
        places,
        notes: [],
        importStatus: { sourceCount: 0 },
      },
    }),
  );
  await page.route('**/api/media/*/places', (r) =>
    r.fulfill({
      json: { suggestions: [{ pageid: 30, title: 'Новое место', dist: 20 }] },
    }),
  );
  await page.route(
    /\/api\/media\/[^/]+\/places\/description\?pageId=30$/,
    (r) => {
      const en = r.request().headers()['x-questkeeps-language'] === 'en';
      return r.fulfill({
        json: {
          title: en ? 'New landmark' : 'Новое место',
          description: en
            ? 'An English recommendation.'
            : 'Описание нового места.',
          summary: en ? 'An English recommendation.' : 'Описание нового места.',
          url: 'https://' + (en ? 'en' : 'ru') + '.wikipedia.org/?curid=30',
          available: true,
        },
      });
    },
  );
  await page.route('**/api/media/*/places/*/text', (r) => {
    const id = Number(
      new URL(r.request().url()).pathname.split('/')[5].replace('place-', ''),
    );
    const language = r.request().headers()['x-questkeeps-language'] || 'ru';
    reads.push({ id, language });
    const en = language === 'en';
    return r.fulfill({
      json: {
        title: specs[id - 1][en ? 2 : 0],
        description: en
          ? 'An English description of ' + specs[id - 1][2] + '.'
          : specs[id - 1][1],
        summary: en
          ? 'An English description of ' + specs[id - 1][2] + '.'
          : specs[id - 1][1],
        url:
          'https://' +
          language +
          '.wikipedia.org/?curid=' +
          (en ? id + 100 : id),
        available: true,
      },
    });
  });
  await page.route('**/api/media/*/places/*/image', (r) =>
    r.fulfill({ json: { image: null } }),
  );
  await page.route('**/api/media/*/preview**', (r) =>
    r.fulfill({ body: image, contentType: 'image/png' }),
  );
  await page.route('**/api/media/*/original**', (r) =>
    r.fulfill({ body: image, contentType: 'image/png' }),
  );
  await page.goto('/?trip=article-locale');
  await page
    .getByRole('button', { name: 'Открытые места', exact: true })
    .click();
  const filters = page.getByRole('group', { name: 'Тип места' });
  await expect(filters).toContainText('Улицы 1');
  await expect(filters).toContainText('Районы 1');
  await expect(filters).toContainText('Парки 1');
  await filters.getByRole('button', { name: 'Улицы 1', exact: true }).click();
  await expect(page.locator('.discovered-place')).toHaveCount(1);
  await expect(page.locator('.discovered-place h2')).toHaveText(
    'Улица Банкалар',
  );
  await page
    .getByRole('button', { name: 'Переключить на английский', exact: true })
    .click();
  await page.locator('.discovered-place').scrollIntoViewIfNeeded();
  await expect(page.locator('.discovered-place h2')).toHaveText(
    'Bankalar Street',
  );
  await expect(page.locator('.place-recommendation h3').first()).toHaveText(
    'New landmark',
  );
  await expect(page.locator('.discovered-place-content > a')).toHaveAttribute(
    'href',
    'https://en.wikipedia.org/?curid=102',
  );
  await page
    .locator('.discovered-place')
    .getByRole('button', { name: 'Your photo', exact: true })
    .click();
  await page.locator('.confirmed-photo-place').scrollIntoViewIfNeeded();
  await expect(page.locator('.confirmed-photo-place strong')).toHaveText(
    'Bankalar Street',
  );
  await expect(page.locator('.confirmed-place-description a')).toHaveAttribute(
    'href',
    'https://en.wikipedia.org/?curid=102',
  );
  await page
    .locator('dialog')
    .getByRole('button', { name: 'Close', exact: true })
    .click();
  await page.locator('.appearance-controls button').first().click();
  await page.locator('.discovered-place').scrollIntoViewIfNeeded();
  await expect(page.locator('.discovered-place h2')).toHaveText(
    'Улица Банкалар',
  );
  await expect(page.locator('.discovered-place-content > a')).toHaveAttribute(
    'href',
    'https://ru.wikipedia.org/?curid=2',
  );
  await filters.getByRole('button', { name: 'Парки 1', exact: true }).click();
  await expect(page.locator('.discovered-place h2')).toHaveText('Гюльхане');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page
    .locator('.discovered-places')
    .screenshot({ path: 'test-results/article-filters-mobile.png' });
  expect(reads.some((r) => r.id === 2 && r.language === 'en')).toBeTruthy();
  expect(reads.some((r) => r.id === 2 && r.language === 'ru')).toBeTruthy();
});
