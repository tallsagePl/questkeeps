import { test, expect } from '@playwright/test';
test('ошибки входа показаны у полей и снимаются после исправления', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .getByLabel('Электронная почта')
    .fill('missing-' + Date.now() + '@example.test');
  await page.getByLabel('Пароль', { exact: true }).fill('WrongPassword123');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  const email = page.locator('input[name="email"]'),
    password = page.locator('input[name="password"]');
  await expect(email).toHaveAttribute('aria-invalid', 'true');
  await expect(password).toHaveAttribute('aria-invalid', 'true');
  await expect(
    page.getByText('Неверный email или пароль', { exact: true }),
  ).toBeVisible();
  const description = await password.getAttribute('aria-describedby');
  expect(description).toBeTruthy();
  await expect(page.locator('[id="' + description + '"]')).toContainText(
    'Неверный email или пароль',
  );
  await expect(page.locator('.error-bar,.toast')).toHaveCount(0);
  await page.screenshot({
    path: 'test-results/login-inline-errors.png',
    fullPage: true,
  });
  await password.fill('CorrectedPassword123');
  await expect(password).not.toHaveAttribute('aria-invalid', 'true');
  await expect(email).toHaveAttribute('aria-invalid', 'true');
  await email.fill('corrected@example.test');
  await expect(email).not.toHaveAttribute('aria-invalid', 'true');
  await expect(
    page.getByText('Неверный email или пароль', { exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Первый раз здесь? Зарегистрироваться' })
    .click();
  await page
    .getByRole('button', { name: 'Создать аккаунт', exact: true })
    .click();
  await expect(page.locator('input[name="name"]')).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await expect(page.locator('input[name="email"]')).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await expect(page.locator('input[name="password"]')).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await expect(page.locator('.field-error')).toHaveCount(3);
  await expect(page.locator('input[name="name"]')).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: 'test-results/registration-inline-errors-mobile.png',
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});
test('даты и текст дневника проверяются возле полей', async ({ page }) => {
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Первый раз здесь? Зарегистрироваться' })
    .click();
  await page.getByLabel('Как вас зовут').fill('Тест');
  await page
    .getByLabel('Электронная почта')
    .fill('fields-' + Date.now() + '@example.test');
  await page.getByLabel('Пароль', { exact: true }).fill('TravelPassword123');
  await page
    .getByRole('button', { name: 'Создать аккаунт', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Новая поездка', exact: true })
    .click();
  await page.getByLabel('Название поездки').fill('Проверка дат');
  await page.getByLabel('Маршрут', { exact: true }).fill('Тбилиси');
  await page.getByRole('button', { name: 'Добавить', exact: true }).click();
  await page.getByLabel('Начало', { exact: true }).fill('2026-10-18');
  await page.getByLabel('Окончание', { exact: true }).fill('2026-10-10');
  await page
    .getByRole('button', { name: 'Создать путешествие', exact: true })
    .click();
  await expect(page.locator('input[name="end"]')).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await expect(
    page.getByText('Дата окончания должна быть не раньше начала', {
      exact: true,
    }),
  ).toBeVisible();
  await page.locator('input[name="end"]').fill('2026-10-20');
  await expect(page.locator('input[name="end"]')).not.toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await page
    .getByRole('button', { name: 'Создать путешествие', exact: true })
    .click();
  await page.getByRole('button', { name: 'Дневник', exact: true }).click();
  await page.getByRole('button', { name: 'Сохранить запись' }).click();
  await expect(page.locator('textarea[name="text"]')).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await expect(page.locator('.note-form .field-error')).toContainText(
    'Заполните это поле',
  );
  await page.getByLabel('Что запомнилось?').fill('Поле исправлено');
  await expect(page.locator('textarea[name="text"]')).not.toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await expect(page.locator('.error-bar,.toast')).toHaveCount(0);
});
