import { test, expect } from '@playwright/test';
test('login accepts email, username and @username; registration remains email-only', async ({
  page,
}) => {
  const suffix = Date.now().toString(36),
    email = 'owl-' + suffix + '@fixture.invalid',
    username = 'owl_' + suffix,
    password = 'FixturePassword123!';
  const origin = { origin: 'http://127.0.0.1:3101' };
  const registered = await page.request.post('/api/auth/register', {
    headers: origin,
    data: { email, password, name: 'Night Owl' },
  });
  expect(registered.ok()).toBeTruthy();
  const changed = await page.request.patch('/api/me', {
    headers: origin,
    data: { username },
  });
  expect(changed.ok()).toBeTruthy();
  await page.goto('/');
  for (const identity of [
    username,
    '@' + username.toUpperCase(),
    email.toUpperCase(),
  ]) {
    await page.getByRole('button', { name: 'Выйти', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Рады вас видеть', exact: true }),
    ).toBeVisible();
    const input = page.getByLabel('Электронная почта или @никнейм', {
      exact: true,
    });
    await expect(input).toHaveAttribute('type', 'text');
    await expect(input).toHaveAttribute('autocomplete', 'username');
    await input.fill(identity);
    await page.getByLabel('Пароль', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Войти', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Ваши путешествия.' }),
    ).toBeVisible();
    await expect(page.locator('.user-button')).toContainText('Night Owl');
  }
  await page.getByRole('button', { name: 'Выйти', exact: true }).click();
  await page
    .getByRole('button', {
      name: 'Первый раз здесь? Зарегистрироваться',
      exact: true,
    })
    .click();
  await page.getByLabel('Как вас зовут', { exact: true }).fill('New User');
  const input = page.getByLabel('Электронная почта', { exact: true });
  await expect(input).toHaveAttribute('type', 'email');
  await input.fill(username);
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page
    .getByRole('button', { name: 'Создать аккаунт', exact: true })
    .click();
  await expect(
    page.getByText('Введите email в формате name@example.com', { exact: true }),
  ).toBeVisible();
});
