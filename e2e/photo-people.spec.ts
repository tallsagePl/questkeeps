import { expect, test } from '@playwright/test';
import sharp from 'sharp';

const participant = { id: 'member', name: 'Анна', username: 'anna_trips' };

const owner = { id: 'owner', name: 'Александр', username: 'alex_archive' };

const trip = {
  id: 'photo-people-trip',
  title: 'Выходные у моря',
  destination: 'Каш',
  start: '2026-10-10',
  end: '2026-10-10',
  from: '2026-10-10',
  to: '2026-10-10',
  description: '',
};

const photo = {
  id: 'self-mark-photo',
  kind: 'photo',
  mime: 'image/jpeg',
  user_id: owner.id,
  author: owner.name,
  name: 'Кадр на берегу.jpg',
  taken: '2026-10-10',
  revision: '1',
  lat: null,
  lon: null,
};

test.beforeEach(async ({ page }) => {
  const image = await sharp({
    create: { width: 400, height: 300, channels: 3, background: '#687f9c' },
  })
    .jpeg()
    .toBuffer();
  const payload = {
    media: [photo],
    places: [],
    notes: [],
    importStatus: { sourceCount: 1, waiting: false, syncing: false },
  };
  await page.route('**/api/me', (route) =>
    route.fulfill({ json: { user: participant } }),
  );
  await page.route('**/api/trips', (route) =>
    route.fulfill({ json: { trips: [] } }),
  );
  await page.route('**/api/trips/photo-people-trip', (route) =>
    route.fulfill({
      json: { ...payload, trip: { ...trip, role: 'member' } },
    }),
  );
  await page.route('**/api/share/photo-people-fixture', (route) =>
    route.fulfill({
      json: { ...payload, trip: { ...trip, role: 'guest' } },
    }),
  );
  await page.route('**/api/media/self-mark-photo/preview*', (route) =>
    route.fulfill({
      body: image,
      contentType: 'image/jpeg',
    }),
  );
});

test('member can mark themselves, see names and handles, and remove their own mark', async ({
  page,
}) => {
  let marked = false;
  let rejectSave = true;
  await page.route('**/api/media/self-mark-photo/self-mark', (route) => {
    if (route.request().method() === 'PATCH') {
      expect(route.request().postDataJSON()).toEqual({ marked: !marked });
      if (rejectSave) {
        rejectSave = false;
        return route.fulfill({
          status: 503,
          json: { error: 'Fixture unavailable' },
        });
      }
      marked = !marked;
    }
    return route.fulfill({
      json: {
        markedByMe: marked,
        people: marked ? [owner, participant] : [owner],
      },
    });
  });

  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/?trip=' + trip.id);
  const card = page.getByRole('button', { name: /Кадр на берегу/ });
  await card.click();
  const dialog = page.getByRole('dialog');
  const region = dialog.getByRole('region', { name: 'На фото' });
  const mark = region.getByRole('button', { name: 'Это я', exact: true });
  await expect(mark).toHaveAttribute('aria-pressed', 'false');
  await expect(
    region.getByRole('link', { name: 'Александр @alex_archive' }),
  ).toHaveAttribute('href', '/@alex_archive');
  await mark.click();
  await expect(region.getByRole('alert')).toBeVisible();
  await expect(mark).toHaveAttribute('aria-pressed', 'false');
  await mark.click();
  await expect(mark).toHaveAttribute('aria-pressed', 'true');
  await expect(
    region.getByRole('link', { name: 'Анна @anna_trips' }),
  ).toBeVisible();
  expect((await mark.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);

  await page.reload();
  await card.click();
  await expect(mark).toHaveAttribute('aria-pressed', 'true');
  await mark.focus();
  await page.keyboard.press('Enter');
  await expect(mark).toHaveAttribute('aria-pressed', 'false');
  await expect(region.getByText('@anna_trips')).toHaveCount(0);
  await expect(region.getByText('@alex_archive')).toBeVisible();
});

test('guest view never requests photo marks, including with an active session', async ({
  page,
}) => {
  let markRequests = 0;
  await page.route('**/api/media/self-mark-photo/self-mark*', (route) => {
    markRequests++;
    return route.fulfill({ json: { markedByMe: true, people: [participant] } });
  });
  await page.goto('/s/photo-people-fixture');
  await page.getByRole('button', { name: /Кадр на берегу/ }).click();
  await expect(
    page.getByRole('dialog').getByText('Скачать оригинал'),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Это я', exact: true }),
  ).toHaveCount(0);
  expect(markRequests).toBe(0);
});
