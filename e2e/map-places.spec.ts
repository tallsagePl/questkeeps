import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';

test('real public street and district geometry is visible above tiles, with legend and specific unavailable places', async ({
  page,
}) => {
  const shapes = JSON.parse(
    await readFile('tests/fixtures/visited-istanbul.json', 'utf8'),
  );
  const tile = await sharp({
    create: { width: 256, height: 256, channels: 3, background: '#e6edf2' },
  })
    .png()
    .toBuffer();
  const trip = {
    id: 'public-map',
    title: 'Посещённый Стамбул',
    destination: 'Стамбул',
    start: '2026-10-10',
    end: '2026-10-18',
    from: '2026-10-10',
    to: '2026-10-18',
    role: 'owner',
    description: '',
    sharing: false,
  };
  // These are the public landmark coordinates from Wikipedia, not user photo metadata.
  const sites = [
    [
      'istiklal',
      'Истикляль (Стамбул)',
      41.03416667,
      28.97888889,
      'Улица Истикляль — пешеходная улица.',
    ],
    [
      'sultan',
      'Султанахмет',
      41.007876,
      28.977829,
      'Султанахмет — район в старой части Стамбула.',
    ],
    [
      'bankalar',
      'Улица Банкалар',
      41.02389,
      28.973778,
      'Улица Банкалар — историческая улица.',
    ],
    [
      'galata',
      'Галата',
      41.02277778,
      28.97361111,
      'Галата — исторический район.',
    ],
  ] satisfies [string, string, number, number, string][];
  const media = sites.map(([id, title, lat, lon]) => ({
    id,
    name: title,
    title,
    lat,
    lon,
    kind: 'photo',
    mime: 'image/jpeg',
    taken: '2026-10-13T12:00:00',
    date_basis: 'exif',
    user_id: 'owner',
    author: 'Автор',
    hidden: 0,
  }));
  const places = sites.map(([id, title, lat, lon, summary], i) => ({
    id,
    media_id: id,
    title,
    lat,
    lon,
    summary,
    day: '2026-10-13',
    url: 'https://ru.wikipedia.org/?curid=' + (i + 1),
  }));
  media.push({ ...media[1], id: 'sultan-2', taken: '2026-10-14T12:00:00' });
  places.push({
    ...places[1],
    id: 'sultan-2',
    media_id: 'sultan-2',
    day: '2026-10-14',
  });
  for (let i = 0; i < 3; i++)
    places.unshift({
      ...places[1],
      id: 'other-' + i,
      media_id: 'sultan',
      title: 'Другое место ' + i,
      summary: 'Музей — историческое здание.',
      url: 'https://ru.wikipedia.org/?curid=' + (100 + i),
    });
  await page.route('**/api/me', (r) =>
    r.fulfill({
      json: { user: { id: 'owner', name: 'Автор' }, yandexEnabled: false },
    }),
  );
  await page.route('**/api/trips', (r) =>
    r.fulfill({ json: { trips: [trip] } }),
  );
  await page.route('**/api/trips/public-map', (r) =>
    r.fulfill({ json: { trip, media, places, notes: [], sources: [] } }),
  );
  await page.route('**/api/media/*/preview**', (r) =>
    r.fulfill({ body: tile, contentType: 'image/png' }),
  );
  await page.route('**/api/media/*/places/*/image', (r) =>
    r.fulfill({ json: { image: null } }),
  );
  await page.route('**/api/media/*/original**', (r) =>
    r.fulfill({ body: tile, contentType: 'image/png' }),
  );
  await page.route('**/api/media/*/places', (r) =>
    r.fulfill({ json: { suggestions: [] } }),
  );
  await page.route('**/api/trips/public-map/area-suggestions', (r) =>
    r.fulfill({ json: { candidates: [], incomplete: false } }),
  );
  let missingRequests = 0;
  await page.route('**/api/media/*/places/*/geometry', (r) => {
    const key = new URL(r.request().url()).pathname.split('/')[3];
    if (key === 'galata') {
      missingRequests++;
      return r.fulfill({
        json: { type: 'FeatureCollection', features: [], title: 'Галата' },
      });
    }
    return r.fulfill({ json: shapes[key] });
  });
  await page.route('https://services.arcgisonline.com/**', (r) =>
    r.fulfill({ body: tile, contentType: 'image/png' }),
  );
  await page.route('https://*.tile.openstreetmap.org/**', (r) =>
    r.fulfill({ body: tile, contentType: 'image/png' }),
  );
  await page.goto('/?trip=public-map');
  await page
    .locator('.tabbar nav')
    .getByRole('button', { name: 'Карта', exact: true })
    .click();
  const overlays = page.locator('.leaflet-visitedPlaces-pane');
  await expect(overlays.locator('path[stroke="#3448f5"]')).toHaveCount(7);
  await expect(
    overlays.locator('path[stroke="#7851d6"][fill-opacity="0.15"]'),
  ).toHaveCount(1);
  await expect(
    page.getByText('Посещённые улицы', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Посещённые районы и площади', { exact: true }),
  ).toBeVisible();
  await expect(page.locator('.map-geometry-status')).toContainText(
    'Контуры пока не найдены: Галата',
  );
  expect(await overlays.evaluate((el) => getComputedStyle(el).zIndex)).toBe(
    '350',
  );
  const geometryBox = page.locator('.travel-map');
  await geometryBox.screenshot({
    path: 'test-results/visited-streets-districts.png',
  });
  const bankalar = overlays.getByRole('button', {
    name: 'Улица Банкалар',
    exact: true,
  });
  await bankalar.first().dispatchEvent('mouseover');
  await expect(bankalar).toHaveCount(6);
  for (const path of await bankalar.all())
    await expect(path).toHaveAttribute('stroke', '#e5ae00');
  await bankalar.first().dispatchEvent('mouseout');
  for (const path of await bankalar.all())
    await expect(path).toHaveAttribute('stroke', '#3448f5');
  const district = overlays.getByRole('button', {
    name: 'Султанахмет',
    exact: true,
  });
  const contour = await district.getAttribute('d');
  await district.focus();
  await expect(district).toHaveAttribute('stroke', '#e5ae00');
  expect(
    await district.evaluate((el) => getComputedStyle(el).outlineStyle),
  ).toBe('none');
  await district.press('Enter');
  const viewer = page.locator('dialog.modal');
  const selected = viewer.locator(
    '.confirmed-photo-place[data-map-selected="true"]',
  );
  await expect(selected).toHaveAccessibleName('Султанахмет');
  await expect(selected.locator('details')).toHaveAttribute('open', '');
  await expect(selected).toBeInViewport();
  await expect(selected).toBeFocused();
  await expect(viewer.locator('.place-photo-counter')).toHaveText('Фото 1 / 2');
  await viewer.screenshot({ path: 'test-results/map-place-selected.png' });
  await viewer
    .getByRole('button', { name: 'Следующее фото этого места', exact: true })
    .click();
  await expect(viewer.locator('.place-photo-counter')).toHaveText('Фото 2 / 2');
  await expect(selected.locator('details')).toHaveAttribute('open', '');
  await expect(selected).toBeInViewport();
  await viewer.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await expect(district).toHaveAttribute('d', contour!);
  await expect(district).toHaveAttribute('stroke', '#e5ae00');
  await bankalar.first().dispatchEvent('click');
  await expect(selected).toHaveAccessibleName('Улица Банкалар');
  await expect(selected.locator('details')).toHaveAttribute('open', '');
  await expect(selected).toBeInViewport();
  await expect(district).toHaveAttribute('stroke', '#7851d6');
  await viewer.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page
    .getByRole('button', { name: 'Проверить границы ещё раз', exact: true })
    .click();
  await expect.poll(() => missingRequests).toBe(2);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await geometryBox.screenshot({
    path: 'test-results/visited-streets-districts-mobile.png',
  });
});
