import { test, expect } from '@playwright/test';
import sharp from 'sharp';

const headers = { origin: 'http://127.0.0.1:3101' };

test('guest link is retrievable after reload and owner avatar uses the actual profile image', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const email = 'share-' + Date.now() + '@fixture.invalid';
  await page.request.post('/api/auth/register', {
    headers,
    data: { email, name: 'Guest Link Owner', password: 'FixturePassword123' },
  });
  const image = await sharp({
    create: { width: 60, height: 60, channels: 3, background: '#3448f5' },
  })
    .png()
    .toBuffer();
  const avatar = await page.request.put('/api/me/avatar', {
    headers: { ...headers, 'content-type': 'image/png' },
    data: image,
  });
  expect(avatar.ok()).toBeTruthy();
  const created = await page.request.post('/api/trips', {
    headers,
    data: {
      title: 'Share fixture',
      destination: 'Istanbul',
      start: '2026-10-10',
      end: '2026-10-18',
    },
  });
  expect(created.ok()).toBeTruthy();
  const trips = await (await page.request.get('/api/trips')).json();
  const trip = trips.trips.find((item: any) => item.title === 'Share fixture');
  expect(trip).toBeTruthy();
  await page.goto('/?trip=' + trip.id);
  await page
    .getByRole('button', { name: 'Участники и Диски', exact: true })
    .click();
  await expect(page.locator('.member .avatar img').first()).toHaveJSProperty(
    'naturalWidth',
    512,
  );
  await page
    .getByRole('button', { name: 'Создать ссылку', exact: true })
    .click();
  const link = await page
    .getByLabel('Гостевая ссылка', { exact: true })
    .inputValue();
  expect(link).toContain('/s/v1.');
  await expect(
    page.getByRole('button', { name: 'Ссылка скопирована', exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);
  await expect(page.locator('.copy-link-feedback')).toHaveAttribute(
    'data-copied',
    'false',
  );
  await page
    .getByRole('button', { name: 'Скопировать ссылку', exact: true })
    .click();
  await expect(page.locator('.copy-link-feedback')).toHaveAttribute(
    'data-copied',
    'true',
  );
  await expect(
    page.getByRole('link', { name: 'Открыть гостевой просмотр' }),
  ).toHaveAttribute('href', link);
  await page.reload();
  await page
    .getByRole('button', { name: 'Участники и Диски', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Получить ссылку', exact: true })
    .click();
  await expect(page.getByLabel('Гостевая ссылка', { exact: true })).toHaveValue(
    link,
  );
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page
    .getByRole('button', { name: 'Скопировать ссылку', exact: true })
    .click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);
  const guestContext = await context.browser()!.newContext();
  try {
    const guestPage = await guestContext.newPage();
    await guestPage.goto(link);
    await expect(
      guestPage.getByRole('heading', { name: /Share fixture/ }),
    ).toBeVisible();
  } finally {
    await guestContext.close();
  }
  await page.screenshot({ path: 'data/share-link-fixed.png', fullPage: true });
});

test('pending registration has a clear next step; verification signs in and refreshes the registration tab', async ({
  page,
  context,
}) => {
  const email = 'verified-' + Date.now() + '@fixture.invalid';
  await page.request.post('/api/auth/register', {
    headers,
    data: { email, name: 'Mail Traveller', password: 'FixturePassword123' },
  });
  const session = (await context.cookies()).find(
    (cookie) => cookie.name === 'ta_session',
  )!;
  expect(session).toBeTruthy();
  await context.clearCookies();
  await context.route('**/api/auth/register', (route) =>
    route.fulfill({
      json: {
        verificationRequired: true,
        verificationEmail: email,
        message: 'trip.verifyYourEmailUsingTheLinkIn',
      },
    }),
  );
  await context.route('**/api/auth/verify-email', (route) =>
    route.fulfill({
      headers: {
        'set-cookie':
          'ta_session=' + session.value + '; Path=/; HttpOnly; SameSite=Lax',
      },
      json: { verified: true, user: { id: 'fixture', name: 'Mail Traveller' } },
    }),
  );
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Первый раз здесь? Зарегистрироваться' })
    .click();
  await page.getByLabel('Как вас зовут').fill('Mail Traveller');
  await page.getByLabel('Электронная почта', { exact: true }).fill(email);
  await page.getByLabel('Пароль', { exact: true }).fill('FixturePassword123');
  await page.getByLabel('Повторите пароль').fill('FixturePassword123');
  await page
    .getByRole('button', { name: 'Создать аккаунт', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Проверьте почту' }),
  ).toBeVisible();
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  await expect(page.locator('input[name="password"]')).toHaveCount(0);
  const verification = await context.newPage();
  await verification.goto('/verify-email#token=' + 'q'.repeat(43));
  await verification
    .getByRole('button', { name: 'Подтвердить почту и войти', exact: true })
    .click();
  await expect(
    verification.getByRole('heading', {
      name: 'Ваши путешествия.',
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Ваши путешествия.', exact: true }),
  ).toBeVisible();
});
