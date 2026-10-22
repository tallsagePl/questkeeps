import { test, expect } from '@playwright/test';
import sharp from 'sharp';

test('trip warms all resources before tabs open, reuses them after reload, and retains city selection and stale contours', async ({
  page,
}) => {
  const trip = {
    id: 'warm-trip',
    title: 'Фоновая поездка',
    destination: 'Стамбул',
    start: '2026-10-10',
    end: '2026-10-18',
    from: '2026-10-10',
    to: '2026-10-18',
    role: 'owner',
    sharing: false,
    description: '',
  };
  const media = Array.from({ length: 12 }, (_, i) => ({
    id: 'warm-' + i,
    name: 'Photo ' + i,
    kind: 'photo',
    mime: 'image/jpeg',
    taken: '2026-10-11',
    author: 'Автор',
    user_id: 'owner',
    lat: 41.01 + i * 0.0001,
    lon: 28.98,
    hidden: 0,
    revision: '1',
    map_city: {
      key: 'istanbul',
      name: 'Стамбул',
      names: { ru: 'Стамбул', en: 'Istanbul' },
    },
  }));
  const places = [
    {
      id: 'district',
      media_id: 'warm-0',
      title: 'Султанахмет',
      summary: 'Султанахмет — район.',
      url: 'https://ru.wikipedia.org/?curid=1',
      day: '2026-10-11',
      lat: 41.01,
      lon: 28.98,
    },
  ];
  await page.route('**/api/me', (r) =>
    r.fulfill({
      json: { user: { id: 'owner', name: 'Автор' }, yandexEnabled: true },
    }),
  );
  await page.route('**/api/trips', (r) =>
    r.fulfill({ json: { trips: [trip] } }),
  );
  await page.route('**/api/trips/warm-trip', (r) =>
    r.fulfill({ json: { trip, media, places, notes: [], sources: [] } }),
  );
  const bytes = await sharp({
    create: { width: 200, height: 150, channels: 3, background: '#886633' },
  })
    .jpeg()
    .toBuffer();
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const previews = new Map<string, number>();
  let areas = 0;
  let geometries = 0;
  let texts = 0;
  let lookups = 0;
  let providersFail = false;
  let refreshed = false;
  let geometryGate: Promise<void> | null = null;
  let releaseGeometry: () => void = () => {};
  await page.route('**/api/media/*/preview*', async (r) => {
    const id = new URL(r.request().url()).pathname.split('/')[3];
    previews.set(id, (previews.get(id) || 0) + 1);
    if (id === 'warm-0') await held;
    await r.fulfill({ body: bytes, contentType: 'image/jpeg' });
  });
  await page.route('**/api/media/*/places', (r) => {
    lookups++;
    return r.fulfill({ json: { suggestions: [] } });
  });
  await page.route('**/api/media/*/places/*/text*', (r) => {
    texts++;
    return r.fulfill({
      json: { description: 'Описание района', summary: 'Описание района' },
    });
  });
  await page.route('**/api/media/*/places/*/image*', (r) =>
    r.fulfill({ json: { image: null } }),
  );
  await page.route('**/api/media/*/places/*/geometry*', async (r) => {
    geometries++;
    if (geometryGate) await geometryGate;
    return providersFail
      ? r.fulfill({ status: 502, json: { error: 'Provider unavailable' } })
      : r.fulfill({
          json: {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                properties: {
                  kind: 'district',
                  title: refreshed ? 'Обновлённый район' : 'Султанахмет',
                },
                geometry: {
                  type: 'Polygon',
                  coordinates: [
                    [
                      [28.97, 41],
                      [28.99, 41],
                      [28.99, 41.02],
                      [28.97, 41.02],
                      [28.97, 41],
                    ],
                  ],
                },
              },
            ],
          },
        });
  });
  await page.route('**/api/trips/warm-trip/area-suggestions', (r) => {
    areas++;
    return r.fulfill({ json: { candidates: [], incomplete: false } });
  });
  await page.route('https://services.arcgisonline.com/**', (r) =>
    r.fulfill({ body: bytes, contentType: 'image/jpeg' }),
  );
  await page.route('https://*.tile.openstreetmap.org/**', (r) =>
    r.fulfill({ body: bytes, contentType: 'image/jpeg' }),
  );
  await page.goto('/?trip=warm-trip');
  await expect.poll(() => previews.get('warm-0') || 0).toBeGreaterThan(0);
  await page.waitForTimeout(1000);
  expect(areas).toBe(0);
  expect(geometries).toBe(0);
  expect(previews.get('warm-11') || 0).toBe(0);
  release();
  await expect
    .poll(() => previews.get('warm-11') || 0, { timeout: 25000 })
    .toBe(1);
  await expect.poll(() => areas).toBe(1);
  await expect.poll(() => geometries, { timeout: 15000 }).toBe(1);
  await expect.poll(() => texts).toBe(1);
  await expect.poll(() => lookups, { timeout: 25000 }).toBe(12);
  const map = () =>
    page
      .locator('.tabbar nav')
      .getByRole('button', { name: 'Карта', exact: true })
      .click();
  await map();
  await expect(page.locator('.leaflet-visitedPlaces-pane path')).toHaveCount(1);
  await page.locator('.map-regions button').nth(1).click();
  const selected = await page
    .locator('.travel-map')
    .getAttribute('data-region');
  expect(selected).not.toBe('all');
  await page.reload();
  await map();
  await expect(page.locator('.travel-map')).toHaveAttribute(
    'data-region',
    selected!,
  );
  await expect(page.locator('.leaflet-visitedPlaces-pane path')).toHaveCount(1);
  expect(areas).toBe(1);
  expect(geometries).toBe(1);
  expect(previews.get('warm-11')).toBe(1);
  providersFail = true;
  geometryGate = new Promise<void>((resolve) => {
    releaseGeometry = resolve;
  });
  const expireGeometry = () =>
    page.evaluate(async () => {
      for (const name of await caches.keys()) {
        if (!name.startsWith('questkeeps-place-resources-')) continue;
        const cache = await caches.open(name);
        for (const req of await cache.keys()) {
          if (!new URL(req.url).pathname.startsWith('/__questkeeps_cache__/'))
            continue;
          const saved = await cache.match(req);
          if (!saved) continue;
          const headers = new Headers(saved.headers);
          headers.set('X-QuestKeeps-Expires', String(Date.now() - 1000));
          await cache.put(req, new Response(await saved.blob(), { headers }));
        }
      }
    });
  await expireGeometry();
  await page.reload();
  await map();
  await expect(page.locator('.leaflet-visitedPlaces-pane path')).toHaveCount(1);
  await expect.poll(() => geometries).toBe(2);
  releaseGeometry();
  geometryGate = null;
  await expect(page.locator('.leaflet-visitedPlaces-pane path')).toHaveCount(1);
  providersFail = false;
  refreshed = true;
  geometryGate = new Promise<void>((resolve) => {
    releaseGeometry = resolve;
  });
  await expireGeometry();
  await page.reload();
  await map();
  await expect(page.locator('.leaflet-visitedPlaces-pane path')).toHaveCount(1);
  await expect.poll(() => geometries).toBe(3);
  releaseGeometry();
  geometryGate = null;
  await expect(
    page.locator('.leaflet-visitedPlaces-pane path'),
  ).toHaveAttribute('aria-label', 'Обновлённый район');
});
