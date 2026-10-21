import { test, expect } from '@playwright/test';
import sharp from 'sharp';
test('лента предлагает уникальные места, сохраняет связь с фото и не повторяет открытые места', async ({
  page,
}) => {
  const trip = {
    id: 'recommendations',
    title: 'Поездка',
    destination: 'Турция',
    start: '2026-10-10',
    end: '2026-10-18',
    from: '2026-10-10',
    to: '2026-10-18',
    role: 'owner',
    sharing: false,
    description: '',
  };
  const media = Array.from({ length: 5 }, (_, i) => ({
    id: 'photo' + i,
    name: 'Photo' + i + '.jpg',
    kind: 'photo',
    mime: 'image/jpeg',
    taken: '2026-10-11',
    author: 'Автор',
    user_id: 'owner',
    lat: i === 4 ? null : 41 + i * 0.01,
    lon: 44,
    hidden: 0,
    revision: '1',
  }));
  const places = [
    {
      id: 'gate',
      media_id: 'old',
      title: 'Ворота Адриана',
      url: 'https://ru.wikipedia.org/?curid=1',
      summary: 'Описание ворот',
      day: '2026-10-11',
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
  await page.route('**/api/trips/recommendations', (r) =>
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
  const image = await sharp({
    create: { width: 320, height: 240, channels: 3, background: '#886633' },
  })
    .jpeg()
    .toBuffer();
  await page.route('**/api/media/*/preview*', (r) =>
    r.fulfill({ body: image, contentType: 'image/jpeg' }),
  );
  await page.route('**/api/media/*/original', (r) =>
    r.fulfill({ body: image, contentType: 'image/jpeg' }),
  );
  await page.route('**/api/media/*/places/*/image', (r) =>
    r.fulfill({ json: { image: null } }),
  );
  let posts = 0,
    lookups = 0,
    failedLookup = true;
  await page.route('**/api/media/*/places', async (r) => {
    const id = r
        .request()
        .url()
        .match(/media\/(photo\d)/)![1],
      i = Number(id.slice(5));
    if (r.request().method() === 'GET') {
      lookups++;
      if (i === 0 && failedLookup) {
        return r.fulfill({ status: 502, json: { error: 'Сбой поиска' } });
      }
      return r.fulfill({
        json: {
          suggestions: [
            {
              pageid: i === 0 ? 1 : i === 3 ? 3 : 2,
              title: i === 0 ? 'Ворота Адриана' : i === 3 ? 'Мечеть' : 'Музей',
              dist: 11 + i,
            },
            ...(i === 3 ? [{ pageid: 4, title: 'Башня', dist: 155 }] : []),
            { pageid: 99, title: 'Румянцево (станция метро)', dist: 1 },
          ],
        },
      });
    }
    posts++;
    if (posts === 1)
      return r.fulfill({ status: 502, json: { error: 'Временная ошибка' } });
    expect(r.request().postDataJSON()).toEqual({ pageId: 2 });
    const place = {
      id: 'museum',
      media_id: id,
      title: 'Музей',
      summary: 'Описание музея',
      url: 'https://ru.wikipedia.org/?curid=2',
      day: '2026-10-11',
      distance: 12,
    };
    places.push(place);
    await r.fulfill({ json: { place } });
  });
  await page.route('**/api/media/*/places/description?*', (r) =>
    r.fulfill({
      json: {
        description: 'Историческое место рядом с кадром.',
        summary: 'Полное описание места.',
      },
    }),
  );
  await page.goto('/?trip=recommendations');
  await page
    .getByRole('button', { name: 'Открытые места', exact: true })
    .click();
  const rail = page.getByRole('region', {
    name: 'Места, которые ещё не добавлены',
    exact: true,
  });
  await expect(rail.locator('article')).toHaveCount(3);
  await expect(rail.locator('.place-brief').first()).toContainText(
    'Историческое место рядом с кадром.',
  );
  await expect(
    rail.getByRole('status').filter({ hasText: 'Ищем места рядом…' }),
  ).toHaveCount(0);
  await expect(rail).toContainText('Сбой поиска');
  await expect(
    rail.getByRole('button', { name: 'Повторить', exact: true }),
  ).toHaveCount(0);
  failedLookup = false;
  await rail
    .getByRole('button', { name: 'Найти ещё места', exact: true })
    .click();
  await expect(rail.getByText('Сбой поиска', { exact: true })).toHaveCount(0);
  await expect(
    rail.getByRole('button', { name: 'Найти ещё места', exact: true }),
  ).toHaveCount(0);
  const dismiss = rail.getByRole('button', {
    name: 'Удалить возможное место: Башня',
    exact: true,
  });
  await dismiss.click();
  const confirmDismiss = page.getByRole('dialog', {
    name: 'Вы уверены, что хотите удалить возможное место?',
    exact: true,
  });
  await expect(confirmDismiss).toContainText(
    'Вы всегда сможете добавить его через фотографию.',
  );
  await expect(
    confirmDismiss.getByRole('button', { name: 'Отмена', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dismiss).toBeFocused();
  await dismiss.click();
  await confirmDismiss
    .getByRole('button', { name: 'Удалить', exact: true })
    .click();
  await expect(rail.locator('article')).toHaveCount(2);
  await expect(rail).not.toContainText('Ворота Адриана');
  await expect(rail).not.toContainText('станция метро');
  await expect(
    rail.getByRole('heading', { name: 'Музей', exact: true }),
  ).toHaveCount(1);
  const add = rail.getByRole('button', {
    name: 'Добавить место: Музей',
    exact: true,
  });
  await add.click();
  await expect(rail.getByRole('alert')).toContainText('Временная ошибка');
  await add.click();
  await expect(rail.locator('article')).toHaveCount(1);
  await expect(
    page.locator('.discovered-place').filter({ hasText: 'Музей' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Галерея', exact: true }).click();
  await page.locator('.photo-card').nth(1).click();
  await expect(page.locator('.confirmed-photo-places')).toContainText('Музей');
  await expect(
    page.getByRole('dialog').getByRole('heading').first(),
  ).toContainText('Музей');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Перейти к карточке места' })
    .click();
  await expect(
    page.locator('.discovered-place').filter({
      has: page.getByRole('heading', { name: 'Музей', exact: true }),
    }),
  ).toBeFocused();
  await expect(rail.locator('article')).toHaveCount(1);
  expect(lookups).toBeLessThanOrEqual(9);
  await expect(rail).not.toContainText('Башня');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
});

test('следующая порция загружается, лимит не вызывает мгновенные повторные запросы', async ({
  page,
}) => {
  const trip = {
    id: 'pagination',
    title: 'Поездка',
    destination: '',
    start: '2026-10-10',
    end: '2026-10-18',
    role: 'owner',
    description: '',
  };
  const media = Array.from({ length: 27 }, (_, i) => ({
    id: 'p' + i,
    name: 'P' + i + '.jpg',
    user_id: 'owner',
    kind: 'photo',
    mime: 'image/jpeg',
    taken: '2026-10-11',
    lat: 41 + i * 0.001,
    lon: 44,
    revision: '1',
  }));
  await page.clock.install();
  await page.route('**/api/me', (r) =>
    r.fulfill({ json: { user: { id: 'owner', name: 'Автор' } } }),
  );
  await page.route('**/api/trips', (r) =>
    r.fulfill({ json: { trips: [trip] } }),
  );
  await page.route('**/api/trips/pagination', (r) =>
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
  await page.route('**/api/media/*/preview*', (r) =>
    r.fulfill({ status: 404, json: { error: 'Preview' } }),
  );
  let limited = true,
    laterCalls = 0;
  await page.route('**/api/media/*/places', async (r) => {
    const index = Number(
      r
        .request()
        .url()
        .match(/media\/p(\d+)/)![1],
    );
    if (index >= 24) {
      laterCalls++;
      if (limited)
        return r.fulfill({
          status: 429,
          json: { error: 'Слишком много попыток' },
        });
    }
    return r.fulfill({
      json: {
        suggestions: [
          {
            pageid: index === 26 ? 2 : 1,
            title: index === 26 ? 'Последнее место' : 'Первое место',
            dist: 11,
          },
        ],
      },
    });
  });
  await page.route('**/api/media/*/places/description?*', (r) =>
    r.fulfill({
      json: {
        description: 'Историческое место рядом с кадром.',
        summary: 'Полное описание места.',
      },
    }),
  );
  await page.goto('/?trip=pagination');
  await page
    .getByRole('button', { name: 'Открытые места', exact: true })
    .click();
  const rail = page.getByRole('region', {
      name: 'Места, которые ещё не добавлены',
      exact: true,
    }),
    more = rail.getByRole('button', { name: 'Найти ещё места', exact: true });
  await expect(
    rail.getByRole('heading', { name: 'Первое место', exact: true }),
  ).toBeVisible();
  await expect(rail).toContainText(
    'Поиск ненадолго приостановлен. Кнопка станет доступна автоматически.',
  );
  await expect(more).toBeDisabled();
  expect(laterCalls).toBeLessThanOrEqual(2);
  limited = false;
  await page.clock.fastForward(61000);
  await expect(
    rail.getByRole('heading', { name: 'Последнее место', exact: true }),
  ).toBeVisible();
  await expect(more).toHaveCount(0);
});

test('не больше 20 карточек, поиск останавливается на заполненной ленте и продолжается после удаления', async ({
  page,
}) => {
  const trip = {
    id: 'limit20',
    title: 'Поездка',
    destination: '',
    description: '',
    from: '2026-10-10',
    to: '2026-10-18',
    start: '2026-10-10',
    end: '2026-10-18',
    role: 'owner',
  };
  const media = Array.from({ length: 30 }, (_, i) => ({
    id: 'limit' + i,
    name: 'Photo.jpg',
    kind: 'photo',
    mime: 'image/jpeg',
    taken: '2026-10-11',
    user_id: 'owner',
    lat: 41 + i * 0.01,
    lon: 44,
    revision: '1',
  }));
  await page.route('**/api/me', (r) =>
    r.fulfill({ json: { user: { id: 'owner', name: 'Автор' } } }),
  );
  await page.route('**/api/trips', (r) =>
    r.fulfill({ json: { trips: [trip] } }),
  );
  await page.route('**/api/trips/limit20', (r) =>
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
  await page.route('**/api/media/*/preview*', (r) =>
    r.fulfill({ status: 404, json: { error: 'Preview' } }),
  );
  let requests = 0;
  await page.route('**/api/media/*/places', (r) => {
    requests++;
    const i = Number(
      r
        .request()
        .url()
        .match(/limit(\d+)/)![1],
    );
    return r.fulfill({
      json: {
        suggestions: Array.from({ length: 5 }, (_, j) => ({
          pageid: i * 5 + j + 1,
          title: 'Место ' + (i * 5 + j + 1),
          dist: j + 10,
        })),
      },
    });
  });
  const descriptions = new Map<number, number>();
  let activeDescriptions = 0,
    peakDescriptions = 0;
  await page.route('**/api/media/*/places/description?*', async (r) => {
    const id = Number(new URL(r.request().url()).searchParams.get('pageId'));
    const count = (descriptions.get(id) || 0) + 1;
    descriptions.set(id, count);
    activeDescriptions++;
    peakDescriptions = Math.max(peakDescriptions, activeDescriptions);
    await new Promise((resolve) => setTimeout(resolve, 150));
    activeDescriptions--;
    if (id === 8 && count === 1)
      return r.fulfill({ status: 503, json: { error: 'Temporary' } });
    return r.fulfill({
      json: {
        description: 'Описание места ' + id,
        summary: 'Полное описание места.',
      },
    });
  });
  await page.goto('/?trip=limit20');
  await page
    .getByRole('button', { name: 'Открытые места', exact: true })
    .click();
  const rail = page.getByRole('region', {
    name: 'Места, которые ещё не добавлены',
    exact: true,
  });
  await expect(rail.locator('article')).toHaveCount(20);
  await expect(
    rail.getByRole('status').filter({ hasText: 'Ищем места рядом…' }),
  ).toHaveCount(0);
  await expect(rail.locator('.place-recommendation-strip')).toHaveCSS(
    'scrollbar-width',
    'none',
  );
  const crop = await rail
    .locator('.place-recommendation-strip')
    .evaluate((strip) => {
      const bounds = strip.getBoundingClientRect();
      return [...strip.querySelectorAll('article')]
        .map((card) => card.getBoundingClientRect())
        .filter((card) => card.left < bounds.right && card.right > bounds.right)
        .map((card) => (bounds.right - card.left) / card.width);
    });
  expect(crop).toHaveLength(1);
  expect(crop[0]).toBeGreaterThan(0.45);
  expect(crop[0]).toBeLessThan(0.55);
  const strip = rail.locator('.place-recommendation-strip');
  const previous = rail.getByRole('button', {
    name: 'Предыдущие места',
    exact: true,
  });
  const next = rail.getByRole('button', {
    name: 'Следующие места',
    exact: true,
  });
  const checkArrowLayout = async () => {
    const bounds = await strip.boundingBox(),
      first = await rail.locator('article').first().boundingBox();
    const left = await previous.boundingBox(),
      right = await next.boundingBox();
    expect(left!.x + left!.width).toBeLessThanOrEqual(bounds!.x);
    expect(right!.x).toBeGreaterThanOrEqual(bounds!.x + bounds!.width);
    expect(
      Math.abs(left!.y + left!.height / 2 - (first!.y + first!.height / 2)),
    ).toBeLessThan(2);
    expect(
      Math.abs(right!.y + right!.height / 2 - (first!.y + first!.height / 2)),
    ).toBeLessThan(2);
  };
  await checkArrowLayout();
  const railBounds = await rail.boundingBox(),
    stripBounds = await strip.boundingBox();
  expect(Math.abs(railBounds!.x - stripBounds!.x)).toBeLessThan(1);
  expect(Math.abs(railBounds!.width - stripBounds!.width)).toBeLessThan(1);
  await page.screenshot({
    path: 'test-results/carousel-wide.png',
    fullPage: true,
  });
  const originalViewport = page.viewportSize()!;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(150);
  await checkArrowLayout();
  await rail.screenshot({ path: 'test-results/carousel-mobile.png' });
  await page.setViewportSize(originalViewport);
  await page.waitForTimeout(150);
  await expect(previous).toBeDisabled();
  await expect(next).toBeEnabled();
  await next.click();
  await expect
    .poll(() => strip.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(200);
  await expect(previous).toBeEnabled();
  await previous.click();
  await expect
    .poll(() => strip.evaluate((element) => element.scrollLeft))
    .toBeLessThan(2);
  await strip.hover();
  const pageTop = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, 100);
  await expect
    .poll(() => strip.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(200);
  expect(await page.evaluate(() => window.scrollY)).toBe(pageTop);
  expect(descriptions.has(18)).toBe(false);
  const eighth = rail.locator('article').filter({
    has: page.getByRole('heading', { name: 'Место 8', exact: true }),
  });
  await eighth.scrollIntoViewIfNeeded();
  await expect(eighth).toContainText('Описание места 8', { timeout: 15000 });
  expect(descriptions.get(8)).toBe(2);
  expect(peakDescriptions).toBeLessThanOrEqual(2);
  await rail.locator('article').first().scrollIntoViewIfNeeded();
  const beforeReload = requests;
  await page.reload();
  await page
    .getByRole('button', { name: 'Открытые места', exact: true })
    .click();
  await expect(rail.locator('article')).toHaveCount(20);
  await page.waitForTimeout(500);
  expect(requests).toBe(beforeReload);
  const full = requests;
  await page.waitForTimeout(400);
  expect(requests).toBe(full);
  expect(requests).toBeLessThanOrEqual(5);
  await rail
    .getByRole('button', {
      name: 'Удалить возможное место: Место 1',
      exact: true,
    })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Удалить', exact: true })
    .click();
  await expect(
    rail.getByRole('heading', { name: 'Место 21', exact: true }),
  ).toBeVisible();
  await expect(rail.locator('article')).toHaveCount(20);
  await expect(
    rail.getByRole('heading', { name: 'Место 1', exact: true }),
  ).toHaveCount(0);
  expect(requests).toBe(full + 1);
});
