import { test, expect } from '@playwright/test';

test('stored validation errors change language and user-authored titles stay unchanged', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(
    page.getByText('Заполните это поле', { exact: true }).first(),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Переключить на английский', exact: true })
    .click();
  await expect(
    page.getByText('Fill in this field', { exact: true }).first(),
  ).toBeVisible();
  await expect(page.locator('main')).not.toContainText('Заполните это поле');

  await page
    .getByRole('button', { name: 'New here? Create an account', exact: true })
    .click();
  await page.getByLabel('Your name', { exact: true }).fill('Start');
  await page
    .getByLabel('Email', { exact: true })
    .fill('i18n-' + Date.now() + '@example.test');
  await page.getByLabel('Password', { exact: true }).fill('TravelPassword123');
  await page
    .getByLabel('Repeat password', { exact: true })
    .fill('TravelPassword123');
  await page
    .getByRole('button', { name: 'Create account', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Your travels.', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Switch to Russian', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Ваши путешествия.', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Мой профиль' })).toContainText(
    'Start',
  );
});

test('OAuth failures are translated from the same locale dictionaries', async ({
  page,
}) => {
  await page.goto('/auth/error?reason=access_denied&intent=link');
  await expect(
    page.getByRole('heading', { name: 'Не удалось завершить подключение' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Переключить на английский', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Connection not completed' }),
  ).toBeVisible();
  await expect(page.locator('main').getByRole('alert')).toContainText(
    'Access was not granted',
  );
  expect(await page.locator('main').innerText()).not.toMatch(/[А-Яа-яЁё]/);
});

test('Yandex downtime on sign-in offers a retry and preserves the trip entry for email sign-in', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(
    '/auth/error?reason=provider_unavailable&intent=login&returnTo=%2F%3Fcreate%3D1',
  );
  await expect(
    page.getByRole('heading', { name: 'Не удалось войти через Яндекс' }),
  ).toBeVisible();
  await expect(page.getByRole('alert')).toContainText(
    'QuestKeeps сейчас не может связаться с Яндексом.',
  );
  const retry = page.getByRole('link', { name: 'Повторить вход через Яндекс' });
  await expect(retry).toHaveAttribute(
    'href',
    '/api/auth/yandex?intent=login&returnTo=%2F%3Fcreate%3D1',
  );
  await expect(page.locator('main')).not.toContainText('provider_unavailable');
  await page.getByRole('link', { name: 'Войти по почте или никнейму' }).click();
  await expect(page).toHaveURL(/\?create=1&mode=login$/);
  await expect(page.locator('input[name="password"]')).toBeVisible();
});

test('parameterized server errors keep their parameters when the language changes', async ({
  page,
}) => {
  await page.route('**/api/auth/login', (route) =>
    route.fulfill({
      status: 400,
      json: {
        error: 'Минимум 12 символов',
        errorTranslation: {
          key: 'validation.minLength',
          params: { count: 12 },
        },
      },
    }),
  );
  await page.goto('/');
  await page
    .getByLabel('Электронная почта или никнейм', { exact: true })
    .fill('fixture@example.test');
  await page.getByLabel('Пароль', { exact: true }).fill('ValidPassword');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.locator('main').getByRole('alert')).toContainText(
    'Минимум 12 символов',
  );
  await page
    .getByRole('button', { name: 'Переключить на английский', exact: true })
    .click();
  await expect(page.locator('main').getByRole('alert')).toContainText(
    'At least 12 characters',
  );
});
