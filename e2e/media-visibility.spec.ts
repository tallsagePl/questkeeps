import { test, expect } from '@playwright/test';
import sharp from 'sharp';

test('author switches between public, participants-only and fully hidden from the photo dialog', async ({
  page,
}) => {
  const trip = {
    id: 'visibility',
    title: 'Видимость',
    destination: 'Стамбул',
    start: '2026-10-10',
    end: '2026-10-18',
    from: '2026-10-10',
    to: '2026-10-18',
    role: 'owner',
    description: '',
    sharing: true,
  };
  const media = {
    id: 'photo',
    name: 'Кадр.jpg',
    user_id: 'author',
    author: 'Автор',
    taken: '2026-10-13',
    kind: 'photo',
    mime: 'image/jpeg',
    hidden: 0,
    hidden_from_guests: 0,
    missing: 0,
    revision: '1',
    lat: null,
    lon: null,
  };
  const changes: unknown[] = [];
  await page.route('**/api/me', (r) =>
    r.fulfill({
      json: { user: { id: 'author', name: 'Автор' }, yandexEnabled: true },
    }),
  );
  await page.route('**/api/friends/link/accept', (r) =>
    r.fulfill({ json: { accepted: false } }),
  );
  await page.route('**/api/trips', (r) =>
    r.fulfill({ json: { trips: [trip] } }),
  );
  await page.route('**/api/trips/visibility', (r) =>
    r.fulfill({
      json: {
        trip,
        media: [media],
        notes: [],
        places: [],
        importStatus: { sourceCount: 1 },
      },
    }),
  );
  const image = await sharp({
    create: { width: 160, height: 120, channels: 3, background: '#5599aa' },
  })
    .jpeg()
    .toBuffer();
  await page.route('**/api/media/photo/preview*', (r) =>
    r.fulfill({ body: image, contentType: 'image/jpeg' }),
  );
  await page.route('**/api/media/photo/original', (r) =>
    r.fulfill({ body: image, contentType: 'image/jpeg' }),
  );
  await page.route('**/api/media/photo', (r) => {
    const change = r.request().postDataJSON();
    changes.push(change);
    if (change.hidden !== undefined) media.hidden = Number(change.hidden);
    if (change.hiddenFromGuests !== undefined)
      media.hidden_from_guests = Number(change.hiddenFromGuests);
    return r.fulfill({ json: { ok: true } });
  });
  await page.goto('/?trip=visibility');
  await page
    .getByRole('button', { name: /^Открыть фото:/ })
    .first()
    .click();
  const dialog = page.locator('dialog.modal.wide');
  await dialog
    .getByRole('button', { name: 'Скрыть от гостей по ссылке', exact: true })
    .click();
  await expect(
    dialog.getByRole('button', {
      name: 'Показать гостям по ссылке',
      exact: true,
    }),
  ).toBeEnabled();
  await expect(
    dialog.getByRole('link', { name: /^Скачать оригинал/ }),
  ).toBeVisible();
  await dialog
    .getByRole('button', { name: 'Скрыть для всех', exact: true })
    .click();
  await expect(
    dialog.getByRole('button', { name: 'Показать участникам', exact: true }),
  ).toBeEnabled();
  await expect(
    dialog.getByRole('button', {
      name: 'Показать гостям по ссылке',
      exact: true,
    }),
  ).toBeDisabled();
  await expect(
    dialog.getByRole('link', { name: /^Скачать оригинал/ }),
  ).toHaveCount(0);
  await dialog
    .getByRole('button', { name: 'Показать участникам', exact: true })
    .click();
  await expect(
    dialog.getByRole('button', {
      name: 'Показать гостям по ссылке',
      exact: true,
    }),
  ).toBeEnabled();
  await dialog
    .getByRole('button', { name: 'Показать гостям по ссылке', exact: true })
    .click();
  await expect(
    dialog.getByRole('button', {
      name: 'Скрыть от гостей по ссылке',
      exact: true,
    }),
  ).toBeEnabled();
  expect(changes).toEqual([
    { hiddenFromGuests: true },
    { hidden: true },
    { hidden: false },
    { hiddenFromGuests: false },
  ]);
  await dialog.screenshot({
    path: 'test-results/media-visibility-desktop.png',
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await expect
    .poll(() =>
      dialog.evaluate((element) => element.scrollWidth <= element.clientWidth),
    )
    .toBe(true);
  await dialog.screenshot({ path: 'test-results/media-visibility-mobile.png' });
});
