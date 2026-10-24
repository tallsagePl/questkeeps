import { test, expect } from '@playwright/test';

async function register(page: any) {
  const response = await page.request.post('/api/auth/register', {
    headers: { origin: 'http://127.0.0.1:3101' },
    data: {
      email:
        'resilience-' + Date.now() + '-' + Math.random() + '@fixture.invalid',
      name: 'Resilience',
      password: 'Abc123',
    },
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()).user;
}

test('initial network failure preserves the session and offers retry instead of login', async ({
  page,
}) => {
  await register(page);
  await page.route('**/api/me', (route) =>
    route.fulfill({
      status: 503,
      json: { error: 'Fixture network unavailable' },
    }),
  );
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Не удалось открыть архив' }),
  ).toBeVisible();
  await expect(page.locator('input[name="password"]')).toHaveCount(0);
  await page.unroute('**/api/me');
  await page.getByRole('button', { name: 'Повторить', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Ваши путешествия.' }),
  ).toBeVisible();
});

test('password visibility, case rules, confirmation and six-character signup work', async ({
  page,
}) => {
  await page.goto('/');
  const password = page.getByLabel('Пароль', { exact: true });
  await password.fill('KeepMe');
  await page
    .getByRole('button', { name: 'Показать пароль', exact: true })
    .click();
  await expect(password).toHaveAttribute('type', 'text');
  await expect(password).toHaveValue('KeepMe');
  await page
    .getByRole('button', { name: 'Скрыть пароль', exact: true })
    .click();
  await expect(password).toHaveAttribute('type', 'password');
  await page
    .getByRole('button', { name: 'Первый раз здесь? Зарегистрироваться' })
    .click();
  await page.getByLabel('Как вас зовут').fill('Six Character');
  await page
    .getByLabel('Электронная почта', { exact: true })
    .fill('six-ui-' + Date.now() + '@fixture.invalid');
  await password.fill('abcdef');
  const repeat = page.getByLabel('Повторите пароль', { exact: true });
  await repeat.fill('abcdef');
  await page
    .getByRole('button', { name: 'Создать аккаунт', exact: true })
    .click();
  await expect(password).toHaveAttribute('aria-invalid', 'true');
  await password.fill('Abc123');
  await repeat.fill('Other1');
  await page
    .getByRole('button', { name: 'Создать аккаунт', exact: true })
    .click();
  await expect(
    page.getByText('Пароли не совпадают', { exact: true }),
  ).toBeVisible();
  await repeat.fill('Abc123');
  await page
    .getByRole('button', { name: 'Создать аккаунт', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Ваши путешествия.' }),
  ).toBeVisible();
});

test('header retains active travel link, matches About highlight, and trip count has a space', async ({
  page,
}) => {
  await register(page);
  const response = await page.request.post('/api/trips', {
    headers: { origin: 'http://127.0.0.1:3101' },
    data: {
      title: 'Header fixture',
      destination: 'Fixture',
      start: '2026-10-10',
      end: '2026-10-18',
    },
  });
  expect(response.ok()).toBeTruthy();
  await page.goto('/');
  const trips = page
    .locator('header')
    .getByRole('link', { name: 'Путешествия', exact: true });
  await expect(trips).toHaveAttribute('aria-current', 'page');
  const color = await trips.evaluate((el) => getComputedStyle(el).color);
  await expect(page.locator('.trip-meta')).toContainText('0 кадров');
  await page
    .locator('header')
    .getByRole('link', { name: 'О проекте', exact: true })
    .click();
  const about = page
    .locator('header')
    .getByRole('link', { name: 'О проекте', exact: true });
  await expect(about).toHaveAttribute('aria-current', 'page');
  expect(await about.evaluate((el) => getComputedStyle(el).color)).toBe(color);
  await page
    .locator('header')
    .getByRole('link', { name: 'Путешествия', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Ваши путешествия.' }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});

for (const restriction of ['send', 'open', 'uuid'] as const) {
  test(
    'successful login survives browser restriction: ' + restriction,
    async ({ page }) => {
      await page.setViewportSize({ width: 393, height: 852 });
      const user = await register(page);
      await page.context().clearCookies();
      await page.addInitScript((restriction) => {
        if (restriction === 'uuid')
          Object.defineProperty(crypto, 'randomUUID', {
            value: undefined,
            configurable: true,
          });
        class RestrictedChannel {
          onmessage = null;
          constructor() {
            if (restriction === 'open')
              throw new DOMException('Channel blocked', 'SecurityError');
          }
          postMessage() {
            if (restriction === 'send')
              throw new DOMException('Messaging blocked', 'SecurityError');
          }
          close() {}
        }
        Object.defineProperty(globalThis, 'BroadcastChannel', {
          value: RestrictedChannel,
          configurable: true,
        });
      }, restriction);
      await page.goto('/');
      await page
        .getByLabel('Электронная почта или никнейм', { exact: true })
        .fill(user.email);
      await page.getByLabel('Пароль', { exact: true }).fill('Abc123');
      await page.getByRole('button', { name: 'Войти', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'Ваши путешествия.' }),
      ).toBeVisible();
      await page.reload();
      await expect(
        page.getByRole('heading', { name: 'Ваши путешествия.' }),
      ).toBeVisible();
    },
  );
}

for (const stage of ['login', 'trips'] as const) {
  test(
    'a stalled ' + stage + ' request releases the login flow and can recover',
    async ({ page }) => {
      const user = await register(page);
      await page.context().clearCookies();
      await page.addInitScript(() => {
        const timeout = AbortSignal.timeout.bind(AbortSignal);
        // Exercise the real browser abort and UI recovery without a 20-second test wait.
        AbortSignal.timeout = (ms) =>
          timeout(ms === 15000 || ms === 20000 ? 2000 : ms);
      });
      const path = stage === 'login' ? '**/api/auth/login' : '**/api/trips';
      await page.route(path, () => {});
      await page.goto('/');
      const identity = page.getByLabel('Электронная почта или никнейм', {
        exact: true,
      });
      await identity.fill(user.email);
      await page.getByLabel('Пароль', { exact: true }).fill('Abc123');
      await page.getByRole('button', { name: 'Войти', exact: true }).click();
      if (stage === 'login') {
        await expect(
          page.getByRole('button', { name: 'Войти', exact: true }),
        ).toBeEnabled();
        await expect(page.locator('form [role="alert"]')).toContainText(
          'Сервер отвечает слишком долго',
        );
        await expect(identity).toHaveValue(user.email);
        await expect(page.getByLabel('Пароль', { exact: true })).toHaveValue(
          'Abc123',
        );
        await page.unroute(path);
        await page.getByRole('button', { name: 'Войти', exact: true }).click();
      } else {
        await expect(
          page.getByRole('heading', { name: 'Не удалось открыть архив' }),
        ).toBeVisible();
        await expect(page.locator('input[name="password"]')).toHaveCount(0);
        await page.unroute(path);
        await page
          .getByRole('button', { name: 'Повторить', exact: true })
          .click();
      }
      await expect(
        page.getByRole('heading', { name: 'Ваши путешествия.' }),
      ).toBeVisible();
    },
  );
}
