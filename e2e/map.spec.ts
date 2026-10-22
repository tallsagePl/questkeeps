import { test, expect } from '@playwright/test';
import sharp from 'sharp';

test('резервная карта при 403 и миниатюры кадров под картой', async ({
  page,
}) => {
  const trip = {
    id: 'map-photos',
    title: 'Карта',
    destination: '',
    start: '2026-10-10',
    end: '2026-10-18',
    from: '2026-10-10',
    to: '2026-10-18',
    role: 'owner',
    sharing: false,
    description: '',
  };
  const media = Array.from({ length: 32 }, (_, i) => ({
    id: 'geo' + i,
    name: 'Frame' + i + '.jpg',
    title: '',
    mime: 'image/jpeg',
    kind: 'photo',
    user_id: 'owner',
    author: 'Автор',
    hidden: 0,
    revision: '1',
    taken: '2026-10-13',
    capture_time: '14:35',
    map_city: {
      key: 'TR:Istanbul',
      name: 'Istanbul',
      names: { ru: 'Стамбул', en: 'Istanbul' },
    },
    lat: 41.7 + i / 1000,
    lon: 44.8,
  }));
  await page.route('**/api/me', (r) =>
    r.fulfill({
      json: { user: { id: 'owner', name: 'Автор' }, yandexEnabled: true },
    }),
  );
  await page.route('**/api/trips', (r) =>
    r.fulfill({ json: { trips: [trip] } }),
  );
  await page.route('**/api/trips/map-photos', (r) =>
    r.fulfill({
      json: {
        trip,
        media,
        places: [],
        notes: [],
        importStatus: { sourceCount: 1 },
      },
    }),
  );
  await page.route('**/api/media/*/places', (r) =>
    r.fulfill({ json: { suggestions: [] } }),
  );
  const image = await sharp({
    create: { width: 320, height: 240, channels: 3, background: '#5599aa' },
  })
    .jpeg()
    .toBuffer();
  let primary = 0;
  let fallback = 0;
  await page.route('https://services.arcgisonline.com/**', (r) => {
    primary++;
    return r.fulfill({ status: 403, body: 'Forbidden' });
  });
  await page.route('https://tile.openstreetmap.org/**', (r) => {
    fallback++;
    expect(r.request().headers()['referer']).toBe('http://127.0.0.1:3101/');
    return r.fulfill({ body: image, contentType: 'image/jpeg' });
  });
  await page.route('**/api/media/*/preview*', (r) =>
    r.fulfill({ body: image, contentType: 'image/jpeg' }),
  );
  await page.route('**/api/media/*/original', (r) =>
    r.fulfill({ body: image, contentType: 'image/jpeg' }),
  );
  await page.goto('/?trip=map-photos');
  await page.getByRole('button', { name: 'Карта', exact: true }).click();
  await expect.poll(() => fallback).toBeGreaterThan(0);
  expect(primary).toBeGreaterThan(0);
  await expect(
    page.locator('.travel-map img.leaflet-tile').first(),
  ).toHaveAttribute('referrerpolicy', 'origin');
  await expect(page.locator('.map-photo-thumb')).toHaveCount(32);
  await page.getByRole('button', { name: 'Стамбул 32', exact: true }).click();
  await expect(page.locator('.travel-map')).toHaveAttribute(
    'data-region',
    'TR:Istanbul',
  );
  const map = page.locator('.travel-map');
  await map.scrollIntoViewIfNeeded();
  const beforeZoom = Number(await map.getAttribute('data-zoom'));
  await map.hover();
  await page.mouse.wheel(0, -500);
  await expect
    .poll(async () => Number(await map.getAttribute('data-zoom')))
    .toBeGreaterThan(beforeZoom);
  await expect(page.locator('.leaflet-control-attribution')).not.toContainText(
    'Leaflet',
  );
  const first = page.locator('.map-photo-thumb').first();
  await first.scrollIntoViewIfNeeded();
  await expect(first.locator('.media-preview')).toHaveAttribute(
    'data-state',
    'loaded',
  );
  await expect(first.locator('img')).toHaveJSProperty('naturalWidth', 320);
  await expect(first).toContainText('Автор');
  await first.hover();
  await expect(map).toHaveAttribute('data-highlighted', 'geo0');
  await expect(map.locator('[data-media-id="geo0"]')).toHaveAttribute(
    'fill',
    '#ffd447',
  );
  await expect(map.getByRole('tooltip', { name: /Frame0\.jpg/ })).toContainText(
    '14:35',
  );
  await page.mouse.move(0, 0);
  await expect(map.locator('[data-media-id="geo0"]')).toHaveAttribute(
    'fill',
    '#3448f5',
  );

  expect(
    await page.locator('.map-photo-strip .media-preview').count(),
  ).toBeLessThan(20);
  await first.click();
  await expect(page.locator('dialog.modal.wide')).toBeVisible();
  await expect(page.locator('dialog.modal.wide h2')).toContainText('Frame0');
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
});
