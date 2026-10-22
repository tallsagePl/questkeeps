import { test, expect } from '@playwright/test';
import sharp from 'sharp';

test('photos of one landmark paginate inside the same viewer and respect single-photo and date-filter states', async ({
  page,
}) => {
  const image = await sharp({
    create: { width: 640, height: 480, channels: 3, background: '#c9d7eb' },
  })
    .jpeg()
    .toBuffer();
  const trip = {
    id: 'landmark-photos',
    title: 'Фото одного места',
    destination: 'Стамбул',
    start: '2026-10-10',
    end: '2026-10-18',
    from: '2026-10-10',
    to: '2026-10-18',
    role: 'owner',
    description: '',
    sharing: false,
  };
  const media = [1, 2, 3, 4].map((id) => ({
    id: 'photo-' + id,
    name: 'IMG_' + id + '.jpg',
    title: ['Первый кадр', 'Второй кадр', 'Третий кадр', 'Другое место'][
      id - 1
    ],
    kind: 'photo',
    mime: 'image/jpeg',
    taken: '2026-10-' + (id === 4 ? '10' : String(9 + id)) + 'T10:00:00',
    capture_time: '10:00',
    author: 'Автор ' + id,
    user_id: id === 1 ? 'owner' : 'other',
    lat: null,
    lon: null,
    hidden: 0,
    missing: 0,
    revision: '1',
  }));
  media.push(
    { ...media[0], id: 'hidden', hidden: 1 },
    { ...media[0], id: 'missing', missing: 1 },
    { ...media[0], id: 'video', kind: 'video' },
  );
  const places = [2, 1, 3].map((id) => ({
    id: 'place-' + id,
    media_id: 'photo-' + id,
    title: 'Наш музей',
    summary: 'Описание музея.',
    url: 'https://ru.wikipedia.org/?curid=1',
    day: media[id - 1].taken.slice(0, 10),
  }));
  for (const id of ['hidden', 'missing', 'video', 'not-available'])
    places.push({
      id: 'place-' + id,
      media_id: id,
      title: 'Наш музей',
      summary: 'Описание музея.',
      url: 'https://ru.wikipedia.org/?curid=1',
      day: '2026-10-10',
    });
  places.push({
    id: 'other-place',
    media_id: 'photo-4',
    title: 'Другая достопримечательность',
    summary: 'Другое место.',
    url: 'https://ru.wikipedia.org/?curid=2',
    day: '2026-10-10',
  });
  const originals: string[] = [];
  await page.route('**/api/me', (r) =>
    r.fulfill({
      json: { user: { id: 'owner', name: 'Автор' }, yandexEnabled: false },
    }),
  );
  await page.route('**/api/trips', (r) =>
    r.fulfill({ json: { trips: [trip] } }),
  );
  await page.route('**/api/trips/landmark-photos', (r) =>
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
  await page.route('**/api/media/*/preview**', (r) =>
    r.fulfill({ body: image, contentType: 'image/jpeg' }),
  );
  await page.route('**/api/media/*/original**', (r) => {
    originals.push(new URL(r.request().url()).pathname.split('/')[3]);
    return r.fulfill({ body: image, contentType: 'image/jpeg' });
  });
  await page.route('**/api/media/*/places/*/image', (r) =>
    r.fulfill({ json: { image: null } }),
  );
  await page.route('**/api/media/*/places/*/text', (r) =>
    r.fulfill({ json: { description: 'Описание музея.' } }),
  );
  await page.goto('/?trip=landmark-photos');
  await page
    .getByRole('button', { name: 'Открытые места', exact: true })
    .click();
  const museum = page.locator('.discovered-place').filter({
    has: page.getByRole('heading', { name: 'Наш музей', exact: true }),
  });
  const single = page.locator('.discovered-place').filter({
    has: page.getByRole('heading', {
      name: 'Другая достопримечательность',
      exact: true,
    }),
  });
  await expect(
    museum.getByRole('button', { name: 'Ваши фото', exact: true }),
  ).toBeVisible();
  await expect(
    single.getByRole('button', { name: 'Ваше фото', exact: true }),
  ).toBeVisible();
  await museum.getByRole('button', { name: 'Ваши фото', exact: true }).click();
  const viewer = page.locator('dialog.modal');
  const previous = viewer.getByRole('button', {
    name: 'Предыдущее фото этого места',
    exact: true,
  });
  const next = viewer.getByRole('button', {
    name: 'Следующее фото этого места',
    exact: true,
  });
  await expect(
    viewer.getByRole('heading', {
      name: 'Первый кадр Изменить название',
      exact: true,
    }),
  ).toBeVisible();
  await expect(viewer.locator('.place-photo-counter')).toHaveText('Фото 1 / 3');
  await expect(previous).toHaveCount(0);
  await next.click();
  await expect(
    viewer.getByRole('heading', { name: 'Второй кадр', exact: true }),
  ).toBeVisible();
  await expect(viewer.locator('.viewer-meta')).toContainText('Автор 2');
  await expect(viewer.locator('.place-photo-counter')).toHaveText('Фото 2 / 3');
  await next.click();
  await expect(
    viewer.getByRole('heading', { name: 'Третий кадр', exact: true }),
  ).toBeVisible();
  await expect(next).toHaveCount(0);
  await expect(previous).toBeFocused();
  await previous.click();
  await previous.click();
  await expect(viewer.locator('.place-photo-counter')).toHaveText('Фото 1 / 3');
  await viewer
    .getByRole('button', { name: 'Изменить название', exact: true })
    .click();
  await page
    .getByRole('textbox', { name: 'Название кадра', exact: true })
    .press('ArrowRight');
  await expect(viewer.locator('.place-photo-counter')).toHaveText('Фото 1 / 3');
  await page.keyboard.press('Escape');
  await expect(
    viewer.getByRole('button', { name: 'Изменить название', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(viewer.locator('.place-photo-counter')).toHaveText('Фото 2 / 3');
  await expect
    .poll(async () => {
      const a = await next.boundingBox();
      const b = await viewer.locator('.media-viewer').boundingBox();
      return a && b ? Math.abs(a.y + a.height / 2 - b.y - b.height / 2) : 999;
    })
    .toBeLessThan(2);
  await viewer.screenshot({
    path: 'test-results/place-photo-pagination-wide.png',
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await previous.click();
  await expect(next).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await viewer.screenshot({
    path: 'test-results/place-photo-pagination-mobile.png',
  });
  await viewer.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await single.getByRole('button', { name: 'Ваше фото', exact: true }).click();
  await expect(viewer.locator('.place-photo-counter')).toHaveCount(0);
  await expect(next).toHaveCount(0);
  await expect(previous).toHaveCount(0);
  await viewer.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page
    .getByRole('button', { name: 'День поездки: Все дни', exact: true })
    .click();
  await page
    .locator('.trip-calendar-popover')
    .getByRole('button', { name: '11 октября 2026 г.', exact: true })
    .click();
  await page.keyboard.press('Escape');
  await expect(
    museum.getByRole('button', { name: 'Ваше фото', exact: true }),
  ).toBeVisible();
  await museum.getByRole('button', { name: 'Ваше фото', exact: true }).click();
  await expect(
    viewer.getByRole('heading', { name: 'Второй кадр', exact: true }),
  ).toBeVisible();
  await expect(next).toHaveCount(0);
  await expect(previous).toHaveCount(0);
  expect(
    originals.every((id) =>
      ['photo-1', 'photo-2', 'photo-3', 'photo-4'].includes(id),
    ),
  ).toBe(true);
});
