import { test, expect } from '@playwright/test';
import sharp from 'sharp';
test('carousel recovers a damaged cached preview and a later image decoding error', async ({
  page,
}) => {
  const trip = {
    id: 'preview-recovery',
    title: 'Preview recovery',
    destination: 'Стамбул',
    start: '2026-10-10',
    end: '2026-10-18',
    from: '2026-10-10',
    to: '2026-10-18',
    role: 'owner',
    sharing: false,
    description: '',
  };
  const photo = {
    id: 'recovery-photo',
    name: 'IMG.heic',
    kind: 'photo',
    mime: 'image/heic',
    taken: '2026-10-11',
    author: 'Автор',
    user_id: 'owner',
    lat: 41.01,
    lon: 28.98,
    hidden: 0,
    revision: '1',
  };
  await page.route('**/api/me', (r) =>
    r.fulfill({
      json: { user: { id: 'owner', name: 'Автор' }, yandexEnabled: true },
    }),
  );
  await page.route('**/api/trips', (r) =>
    r.fulfill({ json: { trips: [trip] } }),
  );
  await page.route('**/api/trips/preview-recovery', (r) =>
    r.fulfill({
      json: {
        trip,
        media: [photo],
        places: [],
        notes: [],
        sources: [],
        importStatus: { sourceCount: 1 },
      },
    }),
  );
  await page.route('**/api/media/*/places', (r) =>
    r.fulfill({
      json: { suggestions: [{ pageid: 42, title: 'Башня', dist: 20 }] },
    }),
  );
  await page.route('**/api/media/*/places/description?*', (r) =>
    r.fulfill({
      json: {
        description: 'Описание загружено.',
        summary: 'Описание загружено.',
      },
    }),
  );
  const bytes = await sharp({
    create: { width: 320, height: 240, channels: 3, background: '#886633' },
  })
    .jpeg()
    .toBuffer();
  let requests = 0;
  await page.route('**/api/media/*/preview*', (r) => {
    requests++;
    return r.fulfill({ body: bytes, contentType: 'image/jpeg' });
  });
  await page.goto('/?trip=preview-recovery');
  const openPlaces = () =>
    page
      .locator('.tabbar nav')
      .getByRole('button', { name: 'Открытые места', exact: true })
      .click();
  await openPlaces();
  const thumb = page.locator('.place-recommendation .map-photo-thumb');
  await expect(thumb.locator('.media-preview')).toHaveAttribute(
    'data-state',
    'loaded',
  );
  await expect(page.locator('.place-brief')).toContainText(
    'Описание загружено.',
  );
  const initial = requests;
  const poisoned = await page.evaluate(async () => {
    let count = 0;
    for (const name of await caches.keys()) {
      if (!name.startsWith('questkeeps-previews-')) continue;
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        if (!request.url.includes('/recovery-photo/preview')) continue;
        await cache.put(
          request,
          new Response('truncated JPEG', {
            headers: {
              'Content-Type': 'image/jpeg',
              'X-QuestKeeps-Expires': String(Date.now() + 60000),
            },
          }),
        );
        count++;
      }
    }
    return count;
  });
  expect(poisoned).toBeGreaterThan(0);
  await page
    .locator('.tabbar nav')
    .getByRole('button', { name: 'Дневник', exact: true })
    .click();
  await openPlaces();
  await expect(thumb.locator('.media-preview')).toHaveAttribute(
    'data-state',
    'loaded',
  );
  await expect.poll(() => requests).toBeGreaterThan(initial);
  // A partial JPEG may report dimensions even though the browser fires error.
  const beforePartialError = requests;
  await thumb.locator('img').dispatchEvent('error');
  await expect.poll(() => requests).toBeGreaterThan(beforePartialError);
  await expect(thumb.locator('.media-preview')).toHaveAttribute(
    'data-state',
    'loaded',
  );
  const beforeDecodeError = requests;
  await thumb.locator('img').evaluate((image: HTMLImageElement) => {
    image.src = 'data:image/jpeg;base64,AAAA';
  });
  await expect.poll(() => requests).toBeGreaterThan(beforeDecodeError);
  await expect(thumb.locator('.media-preview')).toHaveAttribute(
    'data-state',
    'loaded',
  );
  expect(
    await thumb
      .locator('img')
      .evaluate((image: HTMLImageElement) => image.naturalWidth),
  ).toBeGreaterThan(0);
});
