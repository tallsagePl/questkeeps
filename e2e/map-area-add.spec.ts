import { test, expect } from '@playwright/test';
import sharp from 'sharp';

test('grey district and street proposals add all matched photos and become visited shapes', async ({
  page,
}) => {
  const image = await sharp({
    create: { width: 256, height: 256, channels: 3, background: '#e0e8ed' },
  })
    .png()
    .toBuffer();
  const trip = {
    id: 'area-add',
    title: 'Новые места',
    destination: 'Стамбул',
    start: '2026-10-10',
    end: '2026-10-18',
    from: '2026-10-10',
    to: '2026-10-18',
    role: 'owner',
    sharing: false,
    description: '',
  };
  const media = [1, 2].map((i) => ({
    id: 'photo-' + i,
    title: 'Фото ' + i,
    name: 'IMG_' + i + '.jpg',
    kind: 'photo',
    mime: 'image/jpeg',
    taken: '2026-10-' + (10 + i),
    lat: 41.01 + i * 0.001,
    lon: 28.98,
    user_id: 'owner',
    author: 'Автор',
    hidden: 0,
    missing: 0,
  }));
  const district = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { title: 'Новый район', kind: 'district' },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [28.977, 41.009],
              [28.984, 41.009],
              [28.984, 41.015],
              [28.977, 41.015],
              [28.977, 41.009],
            ],
          ],
        },
      },
    ],
  };
  const street = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { title: 'Новая улица', kind: 'street' },
        geometry: {
          type: 'LineString',
          coordinates: [
            [28.98, 41.009],
            [28.98, 41.015],
          ],
        },
      },
    ],
  };
  const candidates = [
    {
      id: 'osm-relation-100',
      title: 'Новый район',
      kind: 'district',
      photoIds: ['photo-1', 'photo-2'],
      geometry: district,
      url: 'https://www.openstreetmap.org/relation/100',
    },
    {
      id: 'osm-way-200',
      title: 'Новая улица',
      kind: 'street',
      photoIds: ['photo-1', 'photo-2'],
      geometry: street,
      url: 'https://www.openstreetmap.org/way/200',
    },
  ];
  const places: any[] = [];
  let posts = 0;
  let wikiRequests = 0;
  await page.route('**/api/trips/area-add/area-suggestions/*/wiki?*', (r) => {
    wikiRequests++;
    return r.fulfill({
      json: {
        title: 'Новый район',
        url: 'https://ru.wikipedia.org/wiki/Test',
        image: 'https://upload.wikimedia.org/test-area.png',
        description: 'Небольшое описание района. '.repeat(30),
      },
    });
  });
  await page.route('https://upload.wikimedia.org/test-area.png', (r) =>
    r.fulfill({ body: image, contentType: 'image/png' }),
  );
  await page.route('**/api/me', (r) =>
    r.fulfill({
      json: { user: { id: 'owner', name: 'Автор' }, yandexEnabled: false },
    }),
  );
  await page.route('**/api/trips', (r) =>
    r.fulfill({ json: { trips: [trip] } }),
  );
  await page.route('**/api/trips/area-add', (r) =>
    r.fulfill({ json: { trip, media, places, notes: [], sources: [] } }),
  );
  await page.route('**/api/trips/area-add/area-suggestions', (r) => {
    if (r.request().method() === 'GET')
      return r.fulfill({
        json: {
          candidates: candidates.filter(
            (c) => !places.some((p) => p.url === c.url),
          ),
          incomplete: false,
        },
      });
    posts++;
    if (posts === 1)
      return r.fulfill({ status: 503, json: { error: 'Временный сбой' } });
    const c = candidates.find(
      (c) => c.id === r.request().postDataJSON().areaId,
    )!;
    for (const photo of media)
      places.push({
        id: c.id + '-' + photo.id,
        media_id: photo.id,
        title: c.title,
        summary: c.title + ' — ' + (c.kind === 'street' ? 'улица.' : 'район.'),
        url: c.url,
        day: photo.taken,
        lat: photo.lat,
        lon: photo.lon,
        distance: 0,
      });
    return r.fulfill({ json: { added: 2, matched: 2, title: c.title } });
  });
  await page.route('**/api/media/*/places/*/geometry', (r) =>
    r.fulfill({
      json: r.request().url().includes('relation-100') ? district : street,
    }),
  );
  await page.route('**/api/media/*/places/*/image', (r) =>
    r.fulfill({ json: { image: null } }),
  );
  await page.route('**/api/media/*/places/*/text', (r) =>
    r.fulfill({ json: { description: 'История места.' } }),
  );
  await page.route('**/api/media/*/places', (r) =>
    r.fulfill({ json: { suggestions: [] } }),
  );
  await page.route('**/api/media/*/preview**', (r) =>
    r.fulfill({ body: image, contentType: 'image/png' }),
  );
  await page.route('**/api/media/*/original**', (r) =>
    r.fulfill({ body: image, contentType: 'image/png' }),
  );
  await page.route('https://services.arcgisonline.com/**', (r) =>
    r.fulfill({ body: image, contentType: 'image/png' }),
  );
  await page.goto('/?trip=area-add');
  await page
    .locator('.tabbar nav')
    .getByRole('button', { name: 'Карта', exact: true })
    .click();
  const grey = page.locator(
    '.leaflet-suggestedPlaces-pane, .leaflet-suggestedStreets-pane',
  );
  const visited = page.locator('.leaflet-visitedPlaces-pane');
  await expect(grey.locator('path[stroke="#adb4be"]')).toHaveCount(2);
  const proposal = grey.getByRole('button', {
    name: 'Добавить место: Новый район',
    exact: true,
  });
  await page
    .locator('.travel-map')
    .screenshot({ path: 'test-results/map-area-proposals-wide.png' });
  await proposal.focus();
  await expect(proposal).toHaveAttribute('stroke', '#e5ae00');
  await proposal.press('Enter');
  const popup = page.locator('.map-area-proposal');
  await expect(popup).toContainText('Фотографий для привязки: 2');
  await expect(popup).not.toContainText('Фотографии внутри границ района');
  await expect(popup).not.toContainText('Фотографии в пределах 30 м от улицы');
  await expect(
    popup.getByRole('link', { name: 'Википедия ↗' }),
  ).toHaveAttribute('href', 'https://ru.wikipedia.org/wiki/Test');
  await expect(popup.getByRole('img', { name: 'Новый район' })).toBeVisible();
  expect(wikiRequests).toBeGreaterThanOrEqual(1);
  expect(wikiRequests).toBeLessThanOrEqual(2);
  await expect
    .poll(async () => {
      const popupBox = await popup.boundingBox();
      const mapBox = await page.locator('.travel-map').boundingBox();
      return popupBox!.y >= mapBox!.y;
    })
    .toBe(true);
  await page.locator('.travel-map').screenshot({
    path: 'test-results/map-area-wiki-wide.png',
    animations: 'disabled',
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    popup.getByRole('button', {
      name: 'Добавить место к фотографиям',
      exact: true,
    }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await popup.scrollIntoViewIfNeeded();
  await expect(popup).toBeInViewport();
  await page
    .locator('.travel-map')
    .screenshot({ path: 'test-results/map-area-proposals-mobile.png' });
  const add = popup.getByRole('button', {
    name: 'Добавить место к фотографиям',
    exact: true,
  });
  await add.click();
  await expect(popup.getByRole('alert')).toHaveText('Временный сбой');
  await expect(add).toBeEnabled();
  await add.click();
  await expect(
    grey.getByRole('button', {
      name: 'Добавить место: Новый район',
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    visited.getByRole('button', { name: 'Новый район', exact: true }),
  ).toBeVisible();
  await visited
    .getByRole('button', { name: 'Новый район', exact: true })
    .press('Enter');
  const viewer = page.locator('dialog.modal');
  await expect(viewer.locator('.place-photo-counter')).toHaveText('Фото 1 / 2');
  await expect(
    viewer.locator('.confirmed-photo-place[data-map-selected="true"] details'),
  ).toHaveAttribute('open', '');
  await viewer.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await grey
    .getByRole('button', { name: 'Добавить место: Новая улица', exact: true })
    .press('Enter');
  await popup
    .getByRole('button', { name: 'Добавить место к фотографиям', exact: true })
    .click();
  await expect(grey.locator('path')).toHaveCount(0);
  await expect(
    visited.getByRole('button', { name: 'Новая улица', exact: true }),
  ).toHaveAttribute('stroke', '#3448f5');
  await page.screenshot({ path: 'test-results/map-area-added.png' });
  await page
    .locator('.tabbar nav')
    .getByRole('button', { name: 'Открытые места', exact: true })
    .click();
  const card = page.locator('.discovered-place').filter({
    has: page.getByRole('heading', { name: 'Новый район', exact: true }),
  });
  await expect(
    card.getByRole('button', { name: 'Ваши фото', exact: true }),
  ).toBeVisible();
  await expect(
    card.getByRole('link', { name: 'Источник: OpenStreetMap ↗' }),
  ).toBeVisible();
});
