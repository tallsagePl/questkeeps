import { test, expect } from '@playwright/test';
import sharp from 'sharp';
test('страны и города ищутся, метки равные и удаляются, описание сохраняется', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Первый раз здесь? Зарегистрироваться' })
    .click();
  await page.getByLabel('Как вас зовут').fill('Путешественник');
  await page
    .getByLabel('Электронная почта')
    .fill('dest-' + Date.now() + '@example.test');
  await page.getByLabel('Пароль', { exact: true }).fill('TravelPassword123');
  await page
    .getByRole('button', { name: 'Создать аккаунт', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Новая поездка', exact: true })
    .click();
  await page.getByLabel('Название поездки').fill('Страны и города');
  await page
    .getByRole('combobox', { name: 'Страна', exact: true })
    .fill('Турц');
  await page.getByRole('option', { name: 'Турция', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Город', exact: true })
    .fill('Анталь');
  await page
    .getByRole('option', { name: /^Анталья/ })
    .first()
    .click();
  await page
    .getByRole('combobox', { name: 'Город', exact: true })
    .fill('Стамбул');
  await page
    .getByRole('option', { name: /^Стамбул/ })
    .first()
    .click();
  await page
    .getByLabel('Маршрут', { exact: true })
    .fill('Очень длинное название маршрута по побережью');
  await page.getByRole('button', { name: 'Добавить', exact: true }).click();
  const sizes = await page
    .locator('.destination-tags li')
    .evaluateAll((items) =>
      items.map((item) => [
        item.getBoundingClientRect().width,
        item.getBoundingClientRect().height,
      ]),
    );
  expect(new Set(sizes.map((item) => JSON.stringify(item))).size).toBe(1);
  await page
    .getByRole('button', {
      name: 'Удалить: Очень длинное название маршрута по побережью',
      exact: true,
    })
    .click();
  await expect(
    page.getByRole('list', { name: 'Выбранные маршруты' }).locator('li'),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({
    path: 'test-results/destination-tags-mobile.png',
    fullPage: true,
  });
  await page.getByLabel('Начало', { exact: true }).fill('2026-10-10');
  await page.getByLabel('Окончание', { exact: true }).fill('2026-10-12');
  await page
    .getByRole('button', { name: 'Создать путешествие', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Страны и города.' }),
  ).toBeVisible();
  await expect(page.locator('.trip-heading .eyebrow')).toContainText(
    'АНТАЛЬЯ → СТАМБУЛ',
  );
  await page.getByRole('button', { name: 'Изменить описание поездки' }).click();
  await page
    .getByLabel('Описание поездки', { exact: true })
    .fill('Мой рассказ о поездке');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await page.reload();
  await expect(page.locator('.trip-description')).toContainText(
    'Мой рассказ о поездке',
  );
});
test('единый диапазон, карты улиц и районов, удаление карточки с подтверждением', async ({
  page,
}) => {
  const trip = {
    id: 'features',
    title: 'Маршрут',
    destination: 'Стамбул',
    start: '2026-10-10',
    end: '2026-10-12',
    from: '2026-10-10',
    to: '2026-10-12',
    description: '',
    role: 'owner',
    sharing: false,
  };
  const media = [10, 11, 12].map((day, i) => ({
    id: 'p' + i,
    name: 'Кадр.jpg',
    kind: 'photo',
    mime: 'image/jpeg',
    taken: '2026-10-' + day,
    user_id: 'owner',
    lat: 41 + i * 0.001,
    lon: 29,
    hidden: 0,
    revision: '1',
  }));
  let places = media.map((photo, i) => ({
    id: 'place' + i,
    media_id: photo.id,
    title: i === 1 ? 'Исторический район' : i === 2 ? 'Старая улица' : 'Музей',
    summary:
      i === 1
        ? 'Район старого города.'
        : i === 2
          ? 'Улица в центре города.'
          : 'Музей города.',
    url: 'https://ru.wikipedia.org/?curid=' + (i + 1),
    lat: photo.lat,
    lon: photo.lon,
    day: photo.taken,
  }));
  await page.route('**/api/me', (r) =>
    r.fulfill({
      json: { user: { id: 'owner', name: 'Автор' }, yandexEnabled: true },
    }),
  );
  await page.route('**/api/trips', (r) =>
    r.fulfill({ json: { trips: [trip] } }),
  );
  await page.route('**/api/trips/features', (r) =>
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
  const image = await sharp({
    create: { width: 320, height: 240, channels: 3, background: '#886633' },
  })
    .jpeg()
    .toBuffer();
  await page.route('**/api/media/*/preview*', (r) =>
    r.fulfill({ body: image, contentType: 'image/jpeg' }),
  );
  await page.route('**/api/media/*/places', (r) =>
    r.fulfill({ json: { suggestions: [] } }),
  );
  await page.route('**/api/media/*/places/*/image', (r) =>
    r.fulfill({ json: { image: null } }),
  );
  await page.route('**/api/media/*/places/*/text', (r) =>
    r.fulfill({
      json: { description: 'Описание места.', summary: 'Описание места.' },
    }),
  );
  await page.route('https://services.arcgisonline.com/**', (r) =>
    r.fulfill({ body: image, contentType: 'image/jpeg' }),
  );
  await page.route('https://*.tile.openstreetmap.org/**', (r) =>
    r.fulfill({ body: image, contentType: 'image/jpeg' }),
  );
  await page.route('**/api/media/*/places/*/geometry', (r) =>
    r.fulfill({
      json: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { kind: 'district', title: 'Исторический район' },
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [28.99, 41],
                  [29.01, 41],
                  [29.01, 41.01],
                  [28.99, 41.01],
                  [28.99, 41],
                ],
              ],
            },
          },
          {
            type: 'Feature',
            properties: { kind: 'street', title: 'Старая улица' },
            geometry: {
              type: 'LineString',
              coordinates: [
                [29, 41],
                [29.002, 41.005],
              ],
            },
          },
        ],
      },
    }),
  );
  await page.route('**/api/trips/features/places/*', (r) => {
    expect(r.request().method()).toBe('DELETE');
    const id = Number(new URL(r.request().url()).pathname.split('/').at(-1));
    places = places.filter((place) => !place.url.endsWith('=' + id));
    return r.fulfill({ json: { ok: true } });
  });
  await page.goto('/?trip=features');
  await page
    .getByRole('button', { name: 'День поездки: Все дни', exact: true })
    .click();
  const calendar = page.locator('.trip-calendar-popover');
  await calendar
    .getByRole('button', { name: '11 октября 2026 г.', exact: true })
    .click();
  await calendar
    .getByRole('button', { name: '12 октября 2026 г.', exact: true })
    .click();
  await expect(page.locator('.photo-card')).toHaveCount(2);
  await page
    .getByRole('button', { name: 'Открытые места', exact: true })
    .click();
  await expect(page.locator('.discovered-place')).toHaveCount(2);
  await expect(
    page.getByRole('button', {
      name: 'День поездки: 11 октября 2026 г. — 12 октября 2026 г.',
      exact: true,
    }),
  ).toBeVisible();
  const district = page.locator('.discovered-place').filter({
    has: page.getByRole('heading', {
      name: 'Исторический район',
      exact: true,
    }),
  });
  await district.getByRole('button', { name: 'Карта', exact: true }).click();
  const dialog = page.getByRole('dialog', {
    name: 'Место на карте',
    exact: true,
  });
  await expect(dialog.locator('path[fill-opacity="0.15"]')).toHaveCount(1);
  await expect(dialog.locator('path[stroke-width="5"]')).toHaveCount(1);
  await dialog
    .getByRole('button', { name: 'Закрыть карту', exact: true })
    .click();
  await district
    .getByRole('button', {
      name: 'Удалить место: Исторический район',
      exact: true,
    })
    .click();
  await expect(district.getByRole('alertdialog')).toContainText('Вы уверены');
  await district.getByRole('button', { name: 'Отмена', exact: true }).click();
  await expect(district).toBeVisible();
  await district
    .getByRole('button', {
      name: 'Удалить место: Исторический район',
      exact: true,
    })
    .click();
  await district.getByRole('button', { name: 'Удалить', exact: true }).click();
  await expect(district).toHaveCount(0);
  await page
    .locator('.tabbar nav')
    .getByRole('button', { name: 'Карта', exact: true })
    .click();
  await expect(page.locator('.map-caption')).toContainText(
    '2 кадров с координатами',
  );
  await expect(
    page.locator('.travel-map path[fill-opacity="0.15"]'),
  ).toHaveCount(1);
  await expect(page.locator('.travel-map path[stroke-width="5"]')).toHaveCount(
    1,
  );
});
