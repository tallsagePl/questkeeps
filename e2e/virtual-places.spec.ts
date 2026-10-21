import { test, expect } from '@playwright/test';
import sharp from 'sharp';
test('place feed keeps a bounded window, retained images and offscreen targets', async ({
  page,
}) => {
  const image = await sharp({
    create: { width: 640, height: 480, channels: 3, background: '#b8cce3' },
  })
    .jpeg()
    .toBuffer();
  const trip = {
    id: 'feed',
    title: 'Лента мест',
    destination: '',
    start: '2026-10-10',
    end: '2026-10-18',
    from: '2026-10-10',
    to: '2026-10-18',
    role: 'owner',
    description: '',
    sharing: false,
  };
  const places = Array.from({ length: 80 }, (_, i) => ({
    id: 'p' + i,
    media_id: 'photo',
    title: 'Место ' + i,
    summary: 'Краткая история места.',
    url: 'https://ru.wikipedia.org/?curid=' + (i + 1),
    day: '2026-10-11',
  }));
  const media = [
    {
      id: 'photo',
      name: 'Кадр.jpg',
      title: 'Кадр',
      kind: 'photo',
      mime: 'image/jpeg',
      taken: '2026-10-11',
      author: 'Автор',
      user_id: 'owner',
      lat: null,
      lon: null,
      hidden: 0,
      missing: 0,
      revision: '1',
    },
  ];
  const requests = new Map<string, number>();
  await page.route('**/api/me', (r) =>
    r.fulfill({
      json: { user: { id: 'owner', name: 'Автор' }, yandexEnabled: false },
    }),
  );
  await page.route('**/api/trips', (r) =>
    r.fulfill({ json: { trips: [trip] } }),
  );
  await page.route('**/api/trips/feed', (r) =>
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
  await page.route('**/api/media/*/places/*/image', (r) => {
    const key = new URL(r.request().url()).pathname;
    requests.set(key, (requests.get(key) || 0) + 1);
    return r.fulfill({
      json: { image: 'https://upload.wikimedia.org/virtual-place.jpg' },
    });
  });
  await page.route('**/api/media/*/places/*/text', (r) =>
    r.fulfill({ json: { description: 'Краткая история места.' } }),
  );
  await page.route('https://upload.wikimedia.org/virtual-place.jpg', (r) =>
    r.fulfill({ body: image, contentType: 'image/jpeg' }),
  );
  await page.route('**/api/media/photo/preview**', (r) =>
    r.fulfill({ body: image, contentType: 'image/jpeg' }),
  );
  await page.route('**/api/media/photo/original**', (r) =>
    r.fulfill({ body: image, contentType: 'image/jpeg' }),
  );
  await page.goto('/?trip=feed');
  await page
    .getByRole('button', { name: 'Открытые места', exact: true })
    .click();
  const feed = page.locator('.virtual-places');
  await feed.evaluate((el) =>
    window.scrollTo({
      top: el.getBoundingClientRect().top + scrollY,
      behavior: 'instant',
    }),
  );
  await expect
    .poll(() => feed.locator('.virtual-places-cell:not([hidden])').count())
    .toBeGreaterThan(2);
  const initialHeight = await feed.evaluate(
    (el) => el.getBoundingClientRect().height,
  );
  const first = feed.locator('[data-place-index="0"]');
  await expect(first.locator('.place-wiki-image img')).toHaveJSProperty(
    'naturalWidth',
    640,
  );
  const firstNode = await first
    .locator('.place-wiki-image img')
    .elementHandle();
  for (let i = 0; i < 9; i++) {
    await page.evaluate(() =>
      window.scrollBy({ top: 500, behavior: 'instant' }),
    );
    if (i > 0)
      await expect.poll(() => feed.getAttribute('data-base-row')).not.toBe('0');
    await page.waitForTimeout(60);
  }
  expect(Number(await feed.getAttribute('data-base-row'))).toBeGreaterThan(10);
  expect(
    await feed.locator('.virtual-places-cell:not([hidden])').count(),
  ).toBeLessThanOrEqual(8);
  expect(
    await feed.evaluate((el) => el.getBoundingClientRect().height),
  ).toBeLessThanOrEqual(initialHeight + 350);
  expect(await firstNode!.evaluate((el) => el.isConnected)).toBe(true);
  expect(await first.getAttribute('hidden')).not.toBeNull();
  expect(requests.size).toBeLessThan(40);
  await page.evaluate(() =>
    window.dispatchEvent(new Event('questkeeps:gallery-start')),
  );
  await expect(feed).toHaveAttribute('data-base-row', '0');
  await first.scrollIntoViewIfNeeded();
  expect(
    await firstNode!.evaluate(
      (el) =>
        el ===
        document.querySelector('[data-place-index="0"] .place-wiki-image img'),
    ),
  ).toBe(true);
  expect(requests.get('/api/media/photo/places/p0/image')).toBe(1);
  await first.getByRole('button', { name: 'Ваше фото', exact: true }).click();
  const dialog = page.locator('dialog.modal');
  await dialog
    .getByRole('button', { name: 'Перейти к карточке места →', exact: true })
    .last()
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(feed.locator('[data-place-index="79"]')).toBeVisible();
  await expect(feed.locator('[data-place-index="79"] article')).toBeFocused();
  await page.screenshot({ path: 'test-results/virtual-places-wide.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await expect(feed.locator('[data-place-index="79"]')).toBeInViewport();
  await page.screenshot({ path: 'test-results/virtual-places-mobile.png' });
});

test('failed public images recover automatically during an idle second pass', async ({
  page,
}) => {
  const image = await sharp({
    create: { width: 400, height: 300, channels: 3, background: '#bfd0e4' },
  })
    .jpeg()
    .toBuffer();
  const trip = {
    id: 'retry-place',
    title: 'Повторная загрузка',
    destination: '',
    start: '2026-10-10',
    end: '2026-10-18',
    from: '2026-10-10',
    to: '2026-10-18',
    role: 'owner',
    sharing: false,
    description: '',
  };
  await page.route('**/api/me', (r) =>
    r.fulfill({
      json: { user: { id: 'owner', name: 'Автор' }, yandexEnabled: false },
    }),
  );
  await page.route('**/api/trips', (r) =>
    r.fulfill({ json: { trips: [trip] } }),
  );
  await page.route('**/api/trips/retry-place', (r) =>
    r.fulfill({
      json: {
        trip,
        media: [],
        notes: [],
        places: [
          {
            id: 'p',
            media_id: 'photo',
            title: 'Место с временным сбоем',
            summary: 'История места.',
            url: 'https://ru.wikipedia.org/?curid=1',
            day: '2026-10-11',
          },
        ],
        importStatus: { sourceCount: 0 },
      },
    }),
  );
  let attempts = 0;
  await page.route('**/api/media/photo/places/p/image', (r) => {
    attempts++;
    return attempts <= 3
      ? r.fulfill({ status: 503, json: { error: 'Temporarily unavailable' } })
      : r.fulfill({
          json: { image: 'https://upload.wikimedia.org/recovered.jpg' },
        });
  });
  await page.route('**/api/media/photo/places/p/text', (r) =>
    r.fulfill({ json: { description: 'История места.' } }),
  );
  await page.route('https://upload.wikimedia.org/recovered.jpg', (r) =>
    r.fulfill({ body: image, contentType: 'image/jpeg' }),
  );
  await page.clock.install();
  await page.goto('/?trip=retry-place');
  await page
    .getByRole('button', { name: 'Открытые места', exact: true })
    .click();
  await expect.poll(() => attempts).toBe(1);
  await page.clock.fastForward(1500);
  await expect.poll(() => attempts).toBe(2);
  await page.clock.fastForward(3000);
  await expect.poll(() => attempts).toBe(3);
  await expect(
    page.getByRole('button', {
      name: 'Повторить загрузку изображения',
      exact: true,
    }),
  ).toBeVisible();
  await page.clock.fastForward(11000);
  await expect.poll(() => attempts).toBe(4);
  await expect(
    page.locator('.discovered-place .place-wiki-image img'),
  ).toHaveJSProperty('naturalWidth', 400);
  await page.clock.fastForward(60000);
  expect(attempts).toBe(4);
});
