import { test, expect, type Locator } from '@playwright/test';
import sharp from 'sharp';
import AxeBuilder from '@axe-core/playwright';

// The mounted budget follows viewport rows and the responsive column count.
async function galleryWindowLimit(grid: Locator) {
  return grid.evaluate((el) => {
    const style = getComputedStyle(el);
    const columns = style.gridTemplateColumns.split(' ').length;
    const card = el.querySelector('.photo-card')!.getBoundingClientRect();
    return (
      columns *
      (Math.ceil(innerHeight / (card.height + (parseFloat(style.gap) || 0))) +
        3)
    );
  });
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/follows/accept', (r) =>
    r.fulfill({ json: { accepted: false } }),
  );
  await page.route('**/api/invitations', (r) =>
    r.fulfill({ json: { invitations: [], count: 0 } }),
  );
  await page.route('**/api/trips/*/area-suggestions*', (r) =>
    r.fulfill({ json: { suggestions: [], areas: [] } }),
  );
  await page.route('**/api/accounts', (r) =>
    r.fulfill({ json: { accounts: [] } }),
  );
  await page.route('**/api/trips/*/sync', (route) =>
    route.fulfill({ json: { synced: 0, failed: 0 } }),
  );
});

test('превью фото и видео, подписи, наведение, клавиатура и уменьшение анимаций', async ({
  page,
}) => {
  const trip = {
    id: 'preview-gallery',
    title: 'Море',
    destination: 'Анталья || Турция',
    start: '2026-10-10',
    end: '2026-10-18',
    from: '2026-10-10',
    to: '2026-10-18',
    role: 'owner',
    sharing: false,
    description: '',
  };
  const media = [
    { id: 'photo', name: 'DSCF0001.JPG', kind: 'photo', mime: 'image/jpeg' },
    { id: 'video', name: 'Holiday clip.MP4', kind: 'video', mime: 'video/mp4' },
    { id: 'failed', name: 'Offline.JPG', kind: 'photo', mime: 'image/jpeg' },
  ].map((m) => ({
    ...m,
    user_id: 'owner',
    author: 'Путешественник',
    hidden: 0,
    taken: '2026-10-10',
    capture_time: m.id === 'photo' ? '12:34' : null,
    lat: null,
    lon: null,
  }));
  await page.route('**/api/me', (r) =>
    r.fulfill({
      json: {
        user: { id: 'owner', name: 'Путешественник' },
        yandexEnabled: true,
      },
    }),
  );
  await page.route('**/api/trips', (r) =>
    r.fulfill({ json: { trips: [trip] } }),
  );
  await page.route('**/api/trips/preview-gallery', (r) =>
    r.fulfill({
      json: {
        trip,
        media,
        notes: [],
        places: [],
        importStatus: { sourceCount: 1, waiting: false, syncing: false },
      },
    }),
  );
  const image = await sharp({
    create: { width: 320, height: 240, channels: 3, background: '#7755aa' },
  })
    .jpeg()
    .toBuffer();
  await page.route('**/api/media/*/preview*', (r) =>
    r.request().url().includes('/failed/')
      ? r.fulfill({ status: 502, json: { error: 'Preview unavailable' } })
      : r.fulfill({
          body: image,
          contentType: 'image/jpeg',
          headers: { 'Cache-Control': 'private, no-store' },
        }),
  );
  await page.route('**/api/media/photo/favorite', async (r) => {
    const { favorite } = r.request().postDataJSON();
    await r.fulfill({ json: { favorite } });
  });
  await page.route('**/api/media/photo', async (r) => {
    expect(r.request().postDataJSON()).toEqual({ title: 'Закат у моря' });
    await r.fulfill({ json: { ok: true } });
  });
  await page.route('**/api/media/photo/original', (r) =>
    r.fulfill({ body: image, contentType: 'image/jpeg' }),
  );
  await page.goto('/?trip=preview-gallery');
  const dayTrigger = page.getByRole('button', {
    name: 'День поездки: Все дни',
    exact: true,
  });
  await dayTrigger.click();
  const calendar = page.locator('.trip-calendar-popover');
  await expect(calendar).toBeVisible();
  await expect(calendar.locator('.in-trip')).toHaveCount(9);
  await expect(
    calendar.getByRole('button', { name: '9 октября 2026 г.', exact: true }),
  ).toBeDisabled();
  await calendar
    .getByRole('button', { name: '11 октября 2026 г.', exact: true })
    .click();
  await page.keyboard.press('Escape');
  await expect(calendar).toHaveCount(0);
  await expect(page.locator('.photo-card')).toHaveCount(0);
  await page
    .getByRole('button', {
      name: 'День поездки: 11 октября 2026 г.',
      exact: true,
    })
    .click();
  await calendar.getByRole('button', { name: 'Все дни', exact: true }).click();
  const cards = page.locator('.photo-card');
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(0).locator('.media-preview')).toHaveAttribute(
    'data-state',
    'loaded',
  );
  await expect(cards.nth(1).locator('.media-preview')).toHaveAttribute(
    'data-state',
    'loaded',
  );
  await expect(cards.nth(0).locator('img')).toHaveJSProperty(
    'naturalWidth',
    320,
  );
  await expect(cards.nth(1).locator('img')).toHaveJSProperty(
    'naturalWidth',
    320,
  );
  await expect(cards.nth(2).getByText('Превью недоступно')).toBeVisible({
    timeout: 12000,
  });
  await expect(cards.nth(0).locator('.photo-filename')).toBeHidden();
  await expect(cards.nth(0).locator('.photo-caption')).toBeVisible();
  await expect(cards.nth(0).locator('.photo-caption')).toHaveText(
    '10 окт., 12:34 · Путешественник',
  );
  await cards.nth(0).hover();
  await expect(cards.nth(0).locator('.photo-filename')).toBeVisible();
  await expect(cards.nth(0).locator('.photo-filename')).toHaveText('DSCF0001');
  await expect(cards.nth(0)).not.toHaveCSS('transform', 'none');
  await page.mouse.move(0, 0);
  await expect(cards.nth(0).locator('.photo-filename')).toBeHidden();
  await cards.nth(0).focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('.favorite-button').first()).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(cards.nth(1)).toBeFocused();
  await expect(cards.nth(1).locator('.photo-filename')).toBeVisible();
  await expect(cards.nth(1).locator('.photo-filename')).toHaveText(
    'Holiday clip',
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(cards.nth(1)).toHaveCSS('transform', 'none');
  const stableStar = page.locator('.favorite-button').first();
  const starBefore = await stableStar.boundingBox();
  await stableStar.hover();
  const starAfter = await stableStar.boundingBox();
  expect(starAfter).toEqual(starBefore);
  await stableStar.click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.favorite-button').first()).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Избранное', exact: true }).click();
  await expect(page.locator('.photo-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Убрать из избранного' }).click();
  await expect(page.getByText('Избранных кадров пока нет')).toBeVisible();
  await page.getByRole('button', { name: 'Все кадры', exact: true }).click();
  await page.locator('.photo-card').first().click();
  await page.getByRole('button', { name: 'Изменить название' }).click();
  await expect(
    page.getByRole('textbox', { name: 'Название кадра' }),
  ).toBeFocused();
  await page
    .getByRole('textbox', { name: 'Название кадра' })
    .fill('Закат у моря');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('heading')).toContainText(
    'Закат у моря',
  );
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await expect(page.locator('.photo-filename').first()).toHaveText(
    'Закат у моря',
  );
  for (const theme of ['light', 'dark']) {
    await page.evaluate(
      (theme) => (document.documentElement.dataset.theme = theme),
      theme,
    );
    const results = await new AxeBuilder({ page })
      .include('.photo-grid')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(async () =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({ path: 'test-results/gallery-preview-mobile.png' });
});

test('ограниченная лента сдвигается в обе стороны без роста страницы и повторных загрузок', async ({
  page,
}) => {
  const trip = {
    id: 'long-gallery',
    title: 'Лента',
    destination: 'Турция',
    start: '2026-10-10',
    end: '2026-10-18',
    from: '2026-10-10',
    to: '2026-10-18',
    role: 'owner',
    sharing: false,
    description: '',
  };
  const media = Array.from({ length: 630 }, (_, i) => ({
    id: 'image-' + i,
    revision: '1',
    favorite: i === 600,
    name: 'Frame ' + i + '.JPG',
    kind: 'photo',
    mime: 'image/jpeg',
    user_id: 'owner',
    author: 'Автор',
    hidden: 0,
    taken: '2026-10-10',
    lat: null,
    lon: null,
  }));
  await page.route('**/api/me', (r) =>
    r.fulfill({
      json: { user: { id: 'owner', name: 'Автор' }, yandexEnabled: true },
    }),
  );
  await page.route('**/api/trips', (r) =>
    r.fulfill({ json: { trips: [trip] } }),
  );
  await page.route('**/api/trips/long-gallery', (r) =>
    r.fulfill({
      json: {
        trip,
        media,
        notes: [],
        places: [],
        importStatus: { sourceCount: 1, waiting: false, syncing: false },
      },
    }),
  );
  const image = await sharp({
    create: { width: 160, height: 120, channels: 3, background: '#4499aa' },
  })
    .jpeg()
    .toBuffer();
  const calls = new Map<string, number>();
  let total = 0;
  let hold = false;
  const heldStarts: string[] = [];
  let releaseHeld!: () => void;
  const gate = new Promise<void>((resolve) => {
    releaseHeld = resolve;
  });
  await page.route('**/api/media/*/preview*', async (r) => {
    const id = new URL(r.request().url()).pathname.split('/')[3];
    const count = (calls.get(id) || 0) + 1;
    calls.set(id, count);
    total++;
    if (hold) {
      heldStarts.push(id);
      await gate;
    }
    if (id === 'image-0' && count === 1)
      return r.fulfill({ status: 503, json: { error: 'Temporary outage' } });
    await r.fulfill({ body: image, contentType: 'image/jpeg' }).catch(() => {});
  });
  await page.route('**/api/friends/link/accept', (r) =>
    r.fulfill({ json: { accepted: false } }),
  );
  await page.goto('/?trip=long-gallery');
  const grid = page.locator('.virtual-gallery');
  await expect(grid).toHaveAttribute('data-total', '630');
  await expect(
    page.locator('[data-media-index="0"] .media-preview'),
  ).toHaveAttribute('data-state', 'loaded', { timeout: 10000 });
  expect(calls.get('image-0')).toBe(2);
  expect(
    await page
      .locator('.virtual-gallery-cell:not([hidden]) .photo-card')
      .count(),
  ).toBeLessThanOrEqual(await galleryWindowLimit(grid));
  expect(total).toBeLessThanOrEqual(await galleryWindowLimit(grid));
  const first = await page.locator('.photo-card').first().boundingBox();
  expect(first!.width).toBeGreaterThan(100);
  const originalCard = await page
    .locator('[data-media-index="0"] .photo-card')
    .elementHandle();
  const originalImage = await page
    .locator('[data-media-index="0"] img')
    .getAttribute('src');
  const dimensions = await grid.evaluate((el) => ({
    top: el.getBoundingClientRect().top + window.scrollY,
    height: el.clientHeight,
    pageHeight: document.documentElement.scrollHeight,
  }));
  // Only viewport cells are painted; the native scroll track keeps its full height.
  expect(dimensions.height).toBeGreaterThan(20000);
  await page.evaluate(() => {
    const native = window.scrollBy.bind(window);
    (window as any).__scrollWrites = 0;
    window.scrollBy = ((...args: any[]) => {
      (window as any).__scrollWrites++;
      return (native as any)(...args);
    }) as typeof window.scrollBy;
  });
  for (let row = 0; row < 36; row++) {
    const anchor = await grid.evaluate((el) => {
      const cell = [
        ...el.querySelectorAll<HTMLElement>(
          '.virtual-gallery-cell:not([hidden])',
        ),
      ].find(
        (c) =>
          c.getBoundingClientRect().top > 350 &&
          c.getBoundingClientRect().top < 950,
      );
      return cell
        ? {
            index: cell.dataset.mediaIndex!,
            top: cell.getBoundingClientRect().top,
          }
        : null;
    });
    await page.evaluate(() => window.scrollBy(0, 300));
    await page.waitForTimeout(70);
    if (anchor) {
      const moved = await page
        .locator('[data-media-index="' + anchor.index + '"]')
        .boundingBox();
      expect(moved).not.toBeNull();
      expect(Math.abs(moved!.y - (anchor.top - 300))).toBeLessThan(2);
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollHeight),
    ).toBe(dimensions.pageHeight);
  }
  expect(await page.evaluate(() => (window as any).__scrollWrites)).toBe(36);
  await expect(page.locator('[data-media-index="0"]')).toBeHidden();
  await expect(page.locator('[data-media-index="0"]')).toHaveCount(1);
  await expect
    .poll(async () =>
      Number(
        await page
          .locator('.virtual-gallery-cell:not([hidden])')
          .first()
          .getAttribute('data-media-index'),
      ),
    )
    .toBeGreaterThan(10);
  expect(
    await page
      .locator('.virtual-gallery-cell:not([hidden]) .photo-card')
      .count(),
  ).toBeLessThanOrEqual(await galleryWindowLimit(grid));
  expect(await grid.evaluate((el) => el.clientHeight)).toBe(dimensions.height);
  // Both neighbors must be mounted, including the row above when scrolling down.
  const windowRows = await grid.evaluate((el) => {
    const cells = [
      ...el.querySelectorAll<HTMLElement>(
        '.virtual-gallery-cell:not([hidden])',
      ),
    ];
    const visible = cells.filter(
      (c) =>
        c.getBoundingClientRect().bottom > 0 &&
        c.getBoundingClientRect().top < innerHeight,
    );
    return {
      columns: getComputedStyle(el).gridTemplateColumns.split(' ').length,
      first: Number(cells[0].dataset.mediaIndex),
      visible: Number(visible[0].dataset.mediaIndex),
      last: Number(cells.at(-1)!.dataset.mediaIndex),
      visibleLast: Number(visible.at(-1)!.dataset.mediaIndex),
    };
  });
  expect(windowRows.first).toBe(windowRows.visible - windowRows.columns);
  expect(windowRows.last).toBe(windowRows.visibleLast + windowRows.columns);
  // Native thumb dragging to the top must not be fought by compensating writes.
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await expect(grid).toHaveAttribute('data-base-row', '0');
  await expect(
    page.getByRole('button', { name: 'Наверх', exact: true }),
  ).toHaveCount(0);
  await page.evaluate(() => window.scrollBy(0, 400));

  for (let row = 0; row < 45; row++) {
    await page.evaluate(() => window.scrollBy(0, -300));
    await page.waitForTimeout(50);
  }
  await expect(grid).toHaveAttribute('data-base-row', '0');
  for (let row = 0; row < 6; row++) {
    await page.evaluate(() => window.scrollBy(0, 300));
    await page.waitForTimeout(60);
  }
  await expect(
    page.getByRole('button', { name: 'Наверх', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Наверх', exact: true }).click();
  await expect(grid).toHaveAttribute('data-base-row', '0');
  expect(await page.evaluate(() => scrollY)).toBe(0);
  await expect(
    page.getByRole('button', { name: 'Наверх', exact: true }),
  ).toHaveCount(0);

  await expect(
    page.locator('[data-media-index="0"] .media-preview'),
  ).toHaveAttribute('data-state', 'loaded');
  expect(calls.get('image-0')).toBe(2);
  expect(
    await originalCard!.evaluate(
      (el) =>
        el === document.querySelector('[data-media-index="0"] .photo-card'),
    ),
  ).toBe(true);
  await expect(page.locator('[data-media-index="0"] img')).toHaveAttribute(
    'src',
    originalImage!,
  );
  await page.reload();
  await expect(
    page.locator('[data-media-index="0"] .media-preview'),
  ).toHaveAttribute('data-state', 'loaded');
  expect(calls.get('image-0')).toBe(2);
  await page.locator('[data-media-index="0"] .photo-card').focus();
  await page.keyboard.press('End');
  await expect(
    page.locator('[data-media-index="629"] .photo-card'),
  ).toBeFocused();
  await page.keyboard.press('Home');
  await expect(
    page.locator('[data-media-index="0"] .photo-card'),
  ).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(async () =>
      page.locator('.virtual-gallery-cell:not([hidden]) .photo-card').count(),
    )
    .toBeLessThanOrEqual(await galleryWindowLimit(grid));
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: 'test-results/virtual-gallery-mobile.png' });
  // A changed source file must replace its old cached preview.
  media[0].revision = '2';
  await page.reload();
  await expect(
    page.locator('[data-media-index="0"] .media-preview'),
  ).toHaveAttribute('data-state', 'loaded');
  expect(calls.get('image-0')).toBe(3);
  // Another signed-in user cannot reuse the previous user's preview cache.
  await page.route('**/api/me', (r) =>
    r.fulfill({
      json: {
        user: { id: 'another-user', name: 'Другой пользователь' },
        yandexEnabled: true,
      },
    }),
  );
  await page.reload();
  await expect(
    page.locator('[data-media-index="0"] .media-preview'),
  ).toHaveAttribute('data-state', 'loaded');
  expect(calls.get('image-0')).toBe(4);
  await page.getByRole('button', { name: 'Избранное', exact: true }).click();
  const jump = page.getByRole('button', {
    name: 'Перейти к месту в галерее',
    exact: true,
  });
  await expect(jump).toHaveAttribute('title', 'Перейти к месту в галерее');
  await jump.click();
  await expect(
    page.getByRole('button', { name: 'Все кадры', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  const target = page.locator('[data-media-index="600"] .photo-card');
  await expect(target).toBeFocused();
  const targetBox = await target.boundingBox();
  expect(targetBox!.y).toBeGreaterThanOrEqual(0);
  expect(targetBox!.y + targetBox!.height).toBeLessThanOrEqual(844);
  await expect(page.locator('[data-media-index="600"]')).toHaveAttribute(
    'data-gallery-target',
    'true',
  );
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(jump).toHaveCount(0);

  // Keep old requests stalled, then jump: current-screen requests must start
  // before any old response is released, without showing cancellation errors.
  hold = true;
  await page.evaluate(async () => {
    for (const name of await caches.keys()) await caches.delete(name);
  });
  try {
    await page.reload();
    await expect.poll(() => heldStarts.length).toBeGreaterThanOrEqual(4);
    await page.locator('[data-media-index="0"] .photo-card').focus();
    await page.keyboard.press('End');
    await expect
      .poll(() => heldStarts.includes('image-629'), { timeout: 3000 })
      .toBe(true);
    await expect(
      page.getByText('Превью недоступно', { exact: true }),
    ).toHaveCount(0);
  } finally {
    releaseHeld();
  }
  await expect(
    page.locator('[data-media-index="629"] .media-preview'),
  ).toHaveAttribute('data-state', 'loaded');
});

test('HEIC использует кеш, сбой оригинала не скрывает фото, несколько мест сохраняются без сдвига кнопки', async ({
  page,
}) => {
  const trip = {
    id: 'viewer-places',
    title: 'Тест',
    destination: 'Тест',
    start: '2026-10-10',
    end: '2026-10-18',
    from: '2026-10-10',
    to: '2026-10-18',
    role: 'owner',
    sharing: false,
    description: '',
  };
  const media = [
    { id: 'heic', name: 'IMG_3604.heic', mime: 'image/heic' },
    { id: 'jpeg', name: 'IMG_3605.jpg', mime: 'image/jpeg' },
  ].map((m) => ({
    ...m,
    kind: 'photo',
    user_id: 'owner',
    author: 'Автор',
    taken: '2026-10-11',
    capture_time: '13:47',
    lat: 41.7,
    lon: 44.8,
    hidden: 0,
    revision: '1',
    title: '',
  }));
  const places: any[] = [];
  const suggestions = [
    { pageid: 11, title: 'Ворота Адриана', dist: 11 },
    { pageid: 12, title: 'Музей', dist: 155 },
  ];
  await page.route('**/api/me', (r) =>
    r.fulfill({
      json: { user: { id: 'owner', name: 'Автор' }, yandexEnabled: true },
    }),
  );
  await page.route('**/api/trips', (r) =>
    r.fulfill({ json: { trips: [trip] } }),
  );
  await page.route('**/api/trips/viewer-places', (r) =>
    r.fulfill({
      json: {
        trip,
        media,
        places,
        notes: [],
        importStatus: { sourceCount: 1 },
      },
    }),
  );
  let deletes = 0;
  await page.route('**/api/media/heic', async (r) => {
    const { title } = r.request().postDataJSON();
    media[0].title = title;
    return r.fulfill({ json: { ok: true } });
  });
  await page.route('**/api/media/heic/places/*', async (r) => {
    if (r.request().method() === 'GET')
      return r.fulfill({
        json: r.request().url().endsWith('/image')
          ? { image: null }
          : {
              description: 'Краткое описание места.',
              summary: 'Краткое описание места.',
            },
      });
    expect(r.request().method()).toBe('DELETE');
    deletes++;
    const placeId = new URL(r.request().url()).pathname.split('/').at(-1);
    const index = places.findIndex((p) => p.id === placeId);
    if (index >= 0) places.splice(index, 1);
    return r.fulfill({ json: { ok: true } });
  });
  let confirmations = 0;
  await page.route('**/api/media/heic/places', async (r) => {
    if (r.request().method() === 'GET')
      return r.fulfill({ json: { suggestions } });
    if (++confirmations === 1)
      return r.fulfill({
        status: 400,
        json: { error: 'Место должно находиться рядом с фотографией' },
      });
    const { pageId } = r.request().postDataJSON();
    const suggestion = suggestions.find((s) => s.pageid === pageId)!;
    const place = {
      id: 'place-' + pageId,
      media_id: 'heic',
      day: '2026-10-11',
      title: suggestion.title,
      distance: suggestion.dist,
      summary: 'Краткий рассказ о достопримечательности.',
      url: 'https://ru.wikipedia.org/?curid=' + pageId,
      lat: 41.7,
      lon: 44.8,
    };
    places.push(place);
    return r.fulfill({ json: { place } });
  });
  const image = await sharp({
    create: { width: 640, height: 480, channels: 3, background: '#3448f5' },
  })
    .jpeg()
    .toBuffer();
  let previewCalls = 0;
  await page.route('**/api/media/*/preview*', (r) => {
    previewCalls++;
    return r.fulfill({ body: image, contentType: 'image/jpeg' });
  });
  await page.route('**/api/media/*/original', (r) =>
    r.fulfill({ status: 502, json: { error: 'Unavailable' } }),
  );
  await page.goto('/?trip=viewer-places');
  await expect(
    page.locator('.photo-card .media-preview[data-state="loaded"]'),
  ).toHaveCount(2);
  const initialCalls = previewCalls;
  await page.locator('.photo-card').first().click();
  const dialog = page.locator('dialog.modal.wide');
  await expect(dialog.locator('.media-preview')).toHaveAttribute(
    'data-state',
    'loaded',
  );
  await expect(dialog.locator('.media-preview img')).toHaveJSProperty(
    'naturalWidth',
    640,
  );
  expect(previewCalls).toBe(initialCalls);
  await expect(dialog.locator('.viewer-meta-line')).toContainText(
    '11 октября, 13:47',
  );
  await page.route('https://services.arcgisonline.com/**', (r) =>
    r.fulfill({ body: image, contentType: 'image/jpeg' }),
  );
  await page.route('https://*.tile.openstreetmap.org/**', (r) =>
    r.fulfill({ body: image, contentType: 'image/jpeg' }),
  );
  await dialog.getByRole('button', { name: 'Карта', exact: true }).click();
  const mapDialog = page.getByRole('dialog', {
    name: 'Место съёмки',
    exact: true,
  });
  await expect(mapDialog).toBeVisible();
  await expect(mapDialog.locator('.leaflet-interactive')).toHaveCount(1);
  await expect(
    mapDialog.getByRole('button', { name: 'Закрыть карту' }),
  ).toBeFocused();
  await expect(mapDialog.locator('.leaflet-popup')).toHaveCount(0);
  await mapDialog.locator('.leaflet-interactive').click();
  await expect(mapDialog.locator('.leaflet-popup-content')).toContainText(
    'IMG_3604.heic',
  );
  const tooltipBox = await mapDialog
    .locator('.leaflet-popup-content')
    .boundingBox();
  expect(tooltipBox!.width).toBeGreaterThan(tooltipBox!.height);
  await page.keyboard.press('Escape');
  await expect(mapDialog.locator('.leaflet-popup')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(mapDialog).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Карта', exact: true }),
  ).toBeFocused();

  await expect(dialog.locator('#photo-place-suggestions')).toBeHidden();
  const viewerBoundsBefore = await dialog.boundingBox();
  const imageWidthBefore = (await dialog
    .locator('.media-viewer')
    .boundingBox())!.width;
  await dialog.getByRole('button', { name: 'Что рядом?', exact: true }).click();
  const viewerBoundsAfter = await dialog.boundingBox();
  expect(viewerBoundsAfter).toEqual(viewerBoundsBefore);
  expect((await dialog.locator('.media-viewer').boundingBox())!.width).toBe(
    imageWidthBefore,
  );
  await expect(dialog.locator('#photo-place-suggestions')).toBeVisible();
  await dialog
    .getByRole('button', { name: 'Скрыть места', exact: true })
    .first()
    .click();
  await expect(dialog.locator('#photo-place-suggestions')).toBeHidden();
  await dialog
    .getByRole('button', { name: 'Показать места', exact: true })
    .click();
  await expect(dialog.locator('#photo-place-suggestions')).toBeVisible();
  const row = dialog
    .locator('.suggestion')
    .filter({ hasText: 'Ворота Адриана' });
  const confirm = row.getByRole('button', { name: 'Подтвердить' });
  await dialog
    .locator('#photo-place-suggestions')
    .evaluate((el) =>
      Promise.all(
        el
          .getAnimations({ subtree: true })
          .map((animation) => animation.finished.catch(() => {})),
      ),
    );
  await confirm.scrollIntoViewIfNeeded();
  const before = await confirm.boundingBox();
  await confirm.click();
  await expect(row.getByRole('alert')).toBeVisible();
  const after = await confirm.boundingBox();
  expect(Math.abs(after!.x - before!.x)).toBeLessThan(1);
  expect(Math.abs(after!.y - before!.y)).toBeLessThan(1);
  const error = await row.getByRole('alert').boundingBox();
  expect(error!.x + error!.width).toBeLessThan(after!.x);
  await confirm.click();
  const confirmed = dialog.getByRole('region', { name: 'Места на фотографии' });
  await expect(
    confirmed.locator('article').getByText('Ворота Адриана'),
  ).toBeVisible();
  await expect(
    confirmed.getByText('11 м от кадра', { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Скрыть места', exact: true }).first(),
  ).toBeVisible();
  await expect(dialog.getByRole('heading').first()).toContainText(
    'Ворота Адриана',
  );

  await dialog
    .locator('.suggestion')
    .filter({ hasText: 'Музей' })
    .getByRole('button', { name: 'Подтвердить' })
    .click();
  await expect(confirmed.locator('article')).toHaveCount(2);
  await expect(dialog.getByRole('heading').first()).toContainText('Музей');
  await confirmed
    .locator('article')
    .filter({ hasText: 'Музей' })
    .getByRole('button', { name: 'Перейти к карточке места' })
    .click();
  await expect(dialog).toHaveCount(0);
  const museumCard = page
    .locator('.discovered-place')
    .filter({ has: page.getByRole('heading', { name: 'Музей', exact: true }) });
  await expect(museumCard).toBeFocused();
  await expect(museumCard).toBeInViewport();
  await museumCard
    .getByRole('button', { name: 'Ваше фото', exact: true })
    .click();
  await expect(dialog.getByRole('heading').first()).toContainText('Музей');
  await dialog
    .getByRole('button', { name: 'Удалить место: Музей', exact: true })
    .click();
  const confirmation = dialog.getByRole('alertdialog');
  await expect(confirmation).toContainText(
    'Вы уверены, что хотите удалить это место?',
  );
  await expect(
    confirmation.getByRole('button', {
      name: 'Удалить место: Музей',
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    confirmation.getByRole('button', { name: 'Отмена', exact: true }),
  ).toBeFocused();
  expect(deletes).toBe(0);
  await confirmation
    .getByRole('button', { name: 'Отмена', exact: true })
    .click();
  expect(deletes).toBe(0);
  await expect(confirmed.locator('article')).toHaveCount(2);
  await dialog
    .getByRole('button', { name: 'Удалить место: Музей', exact: true })
    .click();
  await confirmation
    .getByRole('button', { name: 'Удалить', exact: true })
    .click();
  await expect(confirmed.locator('article')).toHaveCount(1);
  expect(deletes).toBe(1);

  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.getByRole('button', { name: 'Галерея', exact: true }).click();
  await page.locator('.photo-card').first().click();
  await expect(
    dialog
      .getByRole('region', { name: 'Места на фотографии' })
      .locator('article'),
  ).toHaveCount(1);
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.locator('.photo-card').nth(1).click();
  await expect(dialog.locator('.media-preview')).toHaveAttribute(
    'data-state',
    'loaded',
  );
  await expect(dialog.locator('.viewer-original')).toHaveCount(0);
  await expect(dialog.locator('.media-preview img')).toHaveJSProperty(
    'naturalWidth',
    640,
  );
  for (const theme of ['light', 'dark']) {
    await page.evaluate((theme) => {
      document.documentElement.dataset.theme = theme;
    }, theme);
    const results = await new AxeBuilder({ page })
      .include('dialog')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await dialog.getByRole('button', { name: 'Карта', exact: true }).click();
  await expect(mapDialog).toBeVisible();
  await expect(mapDialog.locator('.leaflet-interactive')).toHaveCount(1);
  const mapBounds = await mapDialog.boundingBox();
  expect(mapBounds!.width).toBeLessThanOrEqual(390);
  expect(
    (
      await new AxeBuilder({ page })
        .include('.photo-location-dialog')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await mapDialog.getByRole('button', { name: 'Закрыть карту' }).click();
  await expect(dialog).toBeVisible();
});

test('открытые места в отдельной вкладке без дублей, фото справа и адаптация к мобильному экрану', async ({
  page,
}) => {
  const trip = {
    id: 'place-tab',
    title: 'Тест',
    destination: '',
    start: '2026-10-10',
    end: '2026-10-18',
    from: '2026-10-10',
    to: '2026-10-18',
    role: 'owner',
    sharing: false,
    description: '',
  };
  let places = [
    {
      id: 'a',
      media_id: 'photo-1',
      title: 'Ворота Адриана',
      summary: 'История древних ворот.',
      url: 'https://ru.wikipedia.org/?curid=1',
      day: '2026-10-11',
    },
    {
      id: 'b',
      media_id: 'photo-2',
      title: 'Ворота Адриана',
      summary: 'История древних ворот.',
      url: 'https://ru.wikipedia.org/?curid=1',
      day: '2026-10-12',
    },
    {
      id: 'c',
      media_id: 'photo-1',
      title: 'Музей',
      summary: 'История музея.',
      url: 'https://ru.wikipedia.org/?curid=2',
      day: '2026-10-12',
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
  await page.route('**/api/trips/place-tab', (r) =>
    r.fulfill({
      json: {
        trip,
        places,
        media: [
          {
            id: 'photo-1',
            name: 'Наш кадр.jpg',
            title: 'Наш кадр',
            kind: 'photo',
            mime: 'image/jpeg',
            taken: '2026-10-11',
            user_id: 'owner',
            author: 'Автор',
            lat: null,
            lon: null,
            hidden: 0,
            revision: '1',
          },
        ],
        notes: [],
        importStatus: { sourceCount: 0 },
      },
    }),
  );
  let allowMuseumImage = false;
  let infoCalls = 0;
  let imageCalls = 0;
  let textCalls = 0;
  await page.clock.install();
  await page.route(
    '**/api/media/*/places/*/image',
    (r) => (
      r.request().url().includes('/a/') && infoCalls++,
      r.fulfill({
        json: {
          image:
            r.request().url().includes('/a/') || allowMuseumImage
              ? 'https://upload.wikimedia.org/test-gate.jpg'
              : null,
          summary: 'Полное описание места без обрыва на сокращениях.',
        },
      })
    ),
  );
  await page.route('**/api/media/*/places/*/text', (r) => {
    textCalls++;
    if (textCalls === 1)
      return r.fulfill({
        status: 503,
        json: { error: 'Временная ошибка текста' },
      });
    return r.fulfill({
      json: {
        description: 'Полное описание места без обрыва на сокращениях.',
        summary: 'Полное описание места без обрыва на сокращениях.',
      },
    });
  });
  const image = await sharp({
    create: { width: 640, height: 960, channels: 3, background: '#885522' },
  })
    .jpeg()
    .toBuffer();
  await page.route('**/api/media/photo-1/preview*', (r) =>
    r.fulfill({ body: image, contentType: 'image/jpeg' }),
  );
  await page.route('**/api/media/photo-1/original', (r) =>
    r.fulfill({ body: image, contentType: 'image/jpeg' }),
  );
  await page.route('**/api/media/photo-1/places', (r) =>
    r.fulfill({ json: { suggestions: [] } }),
  );
  await page.route(
    'https://upload.wikimedia.org/test-gate.jpg',
    (r) => (
      imageCalls++,
      imageCalls === 1
        ? r.fulfill({ status: 502, body: 'failed' })
        : r.fulfill({
            body: image,
            contentType: 'image/jpeg',
            headers: { 'Access-Control-Allow-Origin': '*' },
          })
    ),
  );
  await page.goto('/?trip=place-tab');
  await expect(page.locator('.discovered-places')).toHaveCount(0);
  const tabs = page.locator('.tabbar nav button');
  await expect(tabs.nth(0)).toHaveText('Галерея');
  await expect(tabs.nth(1)).toHaveText('Открытые места');
  await expect(tabs.nth(2)).toHaveText('Карта');
  await page
    .getByRole('button', { name: 'Открытые места', exact: true })
    .click();
  const section = page.getByRole('region', {
    name: 'Открытые места',
    exact: true,
  });
  await expect(section.locator('article')).toHaveCount(2);
  const card = section.locator('article').first();
  await expect(card).toContainText(
    'Полное описание места без обрыва на сокращениях.',
  );
  await expect(
    card.getByRole('img', { name: 'Ворота Адриана' }),
  ).toHaveJSProperty('naturalWidth', 640);
  await expect(card.locator('.place-wiki-image img')).toHaveCSS(
    'object-fit',
    'cover',
  );
  const switcher = card.locator('.place-image-switch');
  const toggle = card.getByRole('button', {
    name: 'Переключить фото места: Ворота Адриана',
    exact: true,
  });
  await expect(switcher.locator('.media-preview')).toHaveAttribute(
    'data-state',
    'loaded',
  );
  const retained = await card
    .locator('.place-wiki-image img')
    .evaluate((img) => {
      const box = img.parentElement!.getBoundingClientRect();
      const image = img.getBoundingClientRect();
      return box.height / image.height;
    });
  expect(retained).toBeGreaterThan(0.69);
  expect(retained).toBeLessThan(0.71);
  await card.screenshot({ path: 'test-results/place-wiki-photo.png' });
  await expect(switcher.locator('.media-preview img')).toHaveCSS(
    'object-fit',
    'cover',
  );
  await switcher.hover();
  await card.screenshot({ path: 'test-results/place-own-photo.png' });
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await card.getByRole('heading').hover();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await expect(
    page.getByRole('dialog').getByRole('heading', { name: /^Наш кадр/ }),
  ).toBeVisible();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Закрыть', exact: true })
    .click();
  await card.getByRole('heading').hover();
  await toggle.focus();
  await page.keyboard.press('Space');
  await expect(
    page.getByRole('dialog').getByRole('heading', { name: /^Наш кадр/ }),
  ).toBeVisible();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Закрыть', exact: true })
    .click();
  await toggle.dispatchEvent('pointerdown', { pointerType: 'touch' });
  await toggle.dispatchEvent('click', { detail: 1 });
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await toggle.dispatchEvent('pointerdown', { pointerType: 'touch' });
  await toggle.dispatchEvent('click', { detail: 1 });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await card.getByRole('button', { name: 'Ваше фото', exact: true }).click();
  await expect(
    page.getByRole('dialog').getByRole('heading', { name: /^Наш кадр/ }),
  ).toBeVisible();
  const beforeDetailsImages = imageCalls;
  const beforeDetailsInfo = infoCalls;
  const details = page
    .getByRole('dialog')
    .locator('.confirmed-photo-place')
    .first()
    .locator('details');
  const confirmed = details.locator('..');
  await expect(
    confirmed.getByRole('img', { name: 'Ворота Адриана', exact: true }),
  ).toHaveJSProperty('naturalWidth', 640);
  await expect(details).not.toHaveAttribute('open', '');
  expect(imageCalls).toBe(beforeDetailsImages);
  expect(infoCalls).toBe(beforeDetailsInfo);
  const disclosureMotion = await details.evaluate((element) => {
    const details = element as HTMLDetailsElement;
    const closed = details.getBoundingClientRect().height;
    details.querySelector('summary')!.click();
    const motion = details
      .getAnimations()
      .find((animation) =>
        (animation.effect as KeyframeEffect | null)
          ?.getKeyframes()
          .some((frame) => 'height' in frame),
      );
    if (!motion) return { closed, middle: closed, full: closed, duration: 0 };
    motion.pause();
    motion.currentTime = 70;
    const middle = details.getBoundingClientRect().height;
    motion.currentTime = 220;
    const full = details.getBoundingClientRect().height;
    motion.currentTime = 70;
    return {
      closed,
      middle,
      full,
      duration: motion.effect!.getTiming().duration,
    };
  });
  await confirmed.screenshot({ path: 'test-results/disclosure-midpoint.png' });
  await details.evaluate((element) =>
    element.getAnimations().forEach((animation) => animation.finish()),
  );
  expect(disclosureMotion.duration).toBe(220);
  expect(disclosureMotion.middle).toBeGreaterThan(disclosureMotion.closed);
  expect(disclosureMotion.middle).toBeLessThan(disclosureMotion.full);
  await expect(details).toHaveAttribute('open', '');
  const clamp = await details
    .locator('.confirmed-place-text p')
    .evaluate((p) => {
      p.textContent =
        'Ворота Адриана — триумфальная арка в Анталье, построенная в честь императора. '.repeat(
          40,
        );
      return {
        height: p.getBoundingClientRect().height,
        line: parseFloat(getComputedStyle(p).lineHeight),
        full: p.scrollHeight,
      };
    });
  expect(clamp.height).toBeLessThanOrEqual(clamp.line * 6 + 1);
  expect(clamp.full).toBeGreaterThan(clamp.height);
  const closing = await details.evaluate((element) => {
    const full = element.getBoundingClientRect().height;
    element.querySelector('summary')!.click();
    const motion = element
      .getAnimations()
      .find((a) =>
        (a.effect as KeyframeEffect).getKeyframes().some((f) => 'height' in f),
      )!;
    motion.pause();
    motion.currentTime = 60;
    const middle = element.getBoundingClientRect().height;
    const contentVisible = getComputedStyle(
      element.querySelector('.details-body')!,
    ).opacity;
    const remainsOpen = (element as HTMLDetailsElement).open;
    motion.currentTime = 219;
    const end = element.getBoundingClientRect().height;
    motion.finish();
    return { full, middle, end, contentVisible, remainsOpen };
  });
  expect(closing.remainsOpen).toBe(true);
  expect(Number(closing.contentVisible)).toBeGreaterThan(0.9);
  expect(closing.middle).toBeLessThan(closing.full);
  expect(closing.middle).toBeGreaterThan(closing.end);
  await expect(details).not.toHaveAttribute('open', '');
  await details.locator('summary').click();
  await details.evaluate((element) =>
    element.getAnimations().forEach((a) => a.finish()),
  );
  // Reverse before the previous transition finishes, then reopen with the keyboard.
  await details.evaluate((element) => {
    element.querySelector('summary')!.click();
    element.querySelector('summary')!.click();
  });
  await expect(details).toHaveAttribute('open', '');
  await details.locator('summary').click();
  await expect(details).not.toHaveAttribute('open', '');
  await details.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(details).toHaveAttribute('open', '');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await details.locator('summary').click();
  await expect(details).not.toHaveAttribute('open', '');
  expect(
    await details.evaluate(
      (element) =>
        element
          .getAnimations()
          .filter((animation) => animation.playState === 'running').length,
    ),
  ).toBe(0);
  await details.locator('summary').click();
  await expect(details).toHaveAttribute('open', '');
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  expect(imageCalls).toBe(beforeDetailsImages);
  const title = await confirmed
    .locator('.confirmed-place-heading > strong')
    .boundingBox();
  const photo = await confirmed
    .locator('.confirmed-place-picture')
    .boundingBox();
  const trash = await confirmed.locator('.place-trash').boundingBox();
  expect(photo!.x).toBeGreaterThan(title!.x + title!.width);
  expect(trash!.x).toBeGreaterThan(photo!.x + photo!.width);
  await confirmed.screenshot({
    path: 'test-results/confirmed-place-details-wide.png',
  });
  const desktop = page.viewportSize()!;
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(confirmed.locator('.confirmed-place-picture')).toBeVisible();
  await confirmed.screenshot({
    path: 'test-results/confirmed-place-details-mobile.png',
  });
  await page.setViewportSize(desktop);
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Закрыть', exact: true })
    .click();
  const museum = section.locator('article').nth(1);
  const retryImage = museum.getByRole('button', {
    name: 'Повторить загрузку изображения',
    exact: true,
  });
  await expect(retryImage).toBeVisible();
  await museum.locator('.place-photo-toggle').hover();
  await expect(museum.locator('.place-image-switch')).toHaveAttribute(
    'data-own-photo',
    'true',
  );
  await retryImage.hover();
  await expect(museum.locator('.place-image-switch')).toHaveAttribute(
    'data-own-photo',
    'false',
  );
  await expect(
    museum.getByText('Изображение недоступно', { exact: true }),
  ).toBeVisible();
  const retryBounds = await retryImage.boundingBox();
  const imageBounds = await museum.locator('.place-wiki-image').boundingBox();
  expect(retryBounds!.y - imageBounds!.y).toBeLessThan(15);
  expect(
    imageBounds!.x + imageBounds!.width - retryBounds!.x - retryBounds!.width,
  ).toBeLessThan(15);
  await museum.screenshot({ path: 'test-results/place-image-retry.png' });
  allowMuseumImage = true;
  await retryImage.click();
  await expect(
    museum.getByRole('img', { name: 'Музей', exact: true }),
  ).toHaveJSProperty('naturalWidth', 640);
  const initialInfo = infoCalls;
  const initialImages = imageCalls;
  const initialTexts = textCalls;
  await page.getByRole('button', { name: 'Галерея', exact: true }).click();
  await page
    .getByRole('button', { name: 'Открытые места', exact: true })
    .click();
  await expect(
    card.getByRole('img', { name: 'Ворота Адриана' }),
  ).toHaveJSProperty('naturalWidth', 640);
  expect(infoCalls).toBe(initialInfo);
  expect(imageCalls).toBe(initialImages);
  await page.reload();
  await page
    .getByRole('button', { name: 'Открытые места', exact: true })
    .click();
  await expect(
    card.getByRole('img', { name: 'Ворота Адриана' }),
  ).toHaveJSProperty('naturalWidth', 640);
  await expect(card).toContainText(
    'Полное описание места без обрыва на сокращениях.',
  );
  expect(infoCalls).toBe(initialInfo);
  expect(imageCalls).toBe(initialImages);
  expect(textCalls).toBe(initialTexts);
  await page.clock.fastForward(24 * 60 * 60 * 1000 + 1);
  await page.getByRole('button', { name: 'Галерея', exact: true }).click();
  await page
    .getByRole('button', { name: 'Открытые места', exact: true })
    .click();
  await expect(
    card.getByRole('img', { name: 'Ворота Адриана' }),
  ).toHaveJSProperty('naturalWidth', 640);
  await expect.poll(() => infoCalls).toBeGreaterThan(initialInfo);
  await expect.poll(() => imageCalls).toBeGreaterThan(initialImages);
  const textBox = await card.locator('.discovered-place-content').boundingBox();
  const imageBox = await card.locator('.place-wiki-image').boundingBox();
  expect(imageBox!.x).toBeGreaterThanOrEqual(textBox!.x + textBox!.width - 1);
  for (const theme of ['light', 'dark']) {
    await page.evaluate((theme) => {
      document.documentElement.dataset.theme = theme;
    }, theme);
    expect(
      (
        await new AxeBuilder({ page })
          .include('.discovered-places')
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  places = [];
  await page
    .getByRole('button', { name: 'Загрузить новые фотографии', exact: true })
    .click();
  await expect(page.getByText('Здесь появятся открытые места')).toBeVisible();
});
