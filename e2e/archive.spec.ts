import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.route('**/api/trips/*/sync', (route) =>
    route.fulfill({ json: { synced: 0, failed: 0 } }),
  );
});
test('регистрация, поездка, дневник, гостевая ссылка и мобильный интерфейс', async ({
  page,
  browser,
}) => {
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Первый раз здесь? Зарегистрироваться' })
    .click();
  await page.getByLabel('Как вас зовут').fill('Александр');
  await page
    .getByLabel('Электронная почта')
    .fill('travel-' + Date.now() + '@example.test');
  await page
    .getByLabel('Пароль', { exact: true })
    .fill('TravelTestPassword123');
  await page
    .getByLabel('Повторите пароль', { exact: true })
    .fill('TravelTestPassword123');
  await page
    .getByRole('button', { name: 'Создать аккаунт', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Ваши путешествия.' }),
  ).toBeVisible();
  await page.screenshot({
    path: 'test-results/dashboard-desktop.png',
    fullPage: true,
  });
  await page
    .getByRole('button', { name: 'Новая поездка', exact: true })
    .click();
  await page.getByLabel('Название поездки').fill('Осень в Грузии');
  await page.getByLabel('Маршрут', { exact: true }).fill('Тбилиси → Казбеги');
  await page.getByRole('button', { name: 'Добавить', exact: true }).click();
  await page.getByLabel('Начало', { exact: true }).fill('2026-10-10');
  await page.getByLabel('Окончание', { exact: true }).fill('2026-10-18');
  await page.getByText('Добавить описание', { exact: true }).click();
  await page
    .getByLabel('Пара слов о поездке')
    .fill('Дороги, горы и длинные разговоры.');
  await page
    .getByRole('button', { name: 'Создать путешествие', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Осень в Грузии.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Дневник', exact: true }).click();
  await page.getByLabel('Что запомнилось?').fill('Утром увидели горы.');
  await page.getByRole('button', { name: 'Сохранить запись' }).click();
  await expect(
    page.getByText('Утром увидели горы.', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Участники и Диски', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Создать ссылку', exact: true })
    .click();
  const shareLink = await page.getByLabel('Гостевая ссылка').inputValue();
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await guest.goto(shareLink);
  await expect(
    guest.getByText('Гостевой просмотр', { exact: true }),
  ).toBeVisible();
  await guest.getByRole('button', { name: 'Дневник', exact: true }).click();
  await expect(
    guest.getByText('Утром увидели горы.', { exact: true }),
  ).toBeVisible();
  await expect(
    guest.getByRole('button', { name: 'Участники и Диски', exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Отозвать доступ', exact: true })
    .click();
  await expect(
    page.getByText('Доступ по ссылке выключен', { exact: true }),
  ).toBeVisible();
  await guest.reload();
  await expect(guest.locator('.action-feedback')).toContainText(
    'Гостевая ссылка недействительна',
  );
  await guestContext.close();
  await page.getByRole('button', { name: 'Галерея', exact: true }).click();
  await page.screenshot({
    path: 'test-results/trip-desktop.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: 'test-results/trip-mobile.png',
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();

  const tid = new URL(page.url()).searchParams.get('trip')!;
  await page.route('**/api/trips/' + tid, async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    data.media = [
      {
        id: 'fixture',
        name: 'Казбеги.jpg',
        kind: 'photo',
        mime: 'image/jpeg',
        taken: '2026-10-13',
        date_basis: 'exif',
        lat: 42.65,
        lon: 44.64,
        user_id: 'fixture',
        author: 'Александр',
        hidden: 0,
      },
    ];
    await route.fulfill({ response, json: data });
  });
  await page.route('**/api/media/fixture/preview', (route) =>
    route.fulfill({
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        'base64',
      ),
    }),
  );
  await page
    .getByRole('button', { name: 'Загрузить новые фотографии', exact: true })
    .click();
  await expect(page.locator('.photo-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Видео', exact: true }).click();
  await expect(page.locator('.photo-card')).toHaveCount(0);
  await page.getByRole('button', { name: 'Фото', exact: true }).click();
  await expect(page.locator('.photo-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Карта', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Карта фотографий путешествия' }),
  ).toBeVisible();
});
