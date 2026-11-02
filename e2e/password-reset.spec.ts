import { test, expect } from '@playwright/test';

for (const width of [393, 1024, 1440]) {
  for (const language of ['ru', 'en'] as const) {
    test(
      'password reset is explicit, localized and fits ' +
        width +
        ' ' +
        language,
      async ({ page }) => {
        await page.setViewportSize({
          width,
          height: width === 1024 ? 1366 : 900,
        });
        await page.addInitScript(
          ({ language, dark }) => {
            localStorage.setItem('ta-language', language);
            localStorage.setItem('ta-theme', dark ? 'dark' : 'light');
          },
          { language, dark: width === 1024 },
        );
        const raw = 'a'.repeat(43);
        const requests: any[] = [];
        await page.route('**/api/**', (route) => {
          const path = new URL(route.request().url()).pathname;
          if (
            path === '/api/auth/forgot-password' ||
            path === '/api/auth/reset-password'
          ) {
            requests.push(route.request().postDataJSON());
            return route.fulfill({
              json: {
                message: path.endsWith('/forgot-password')
                  ? 'reset.sent'
                  : 'reset.done',
                sessionEnded: false,
              },
            });
          }
          return route.fulfill({
            json: { user: null, yandexEnabled: false, trips: [] },
          });
        });
        await page.goto('/');
        await page
          .getByRole('link', {
            name:
              language === 'ru' ? 'Забыли пароль?' : 'Forgot your password?',
          })
          .click();
        await expect(
          page.getByRole('heading', {
            name:
              language === 'ru' ? 'Восстановить пароль' : 'Reset your password',
          }),
        ).toBeVisible();
        await page
          .locator('input[name="email"]')
          .fill('fixture@example.invalid');
        await page.locator('form button.primary').click();
        await expect(page.getByRole('status')).toBeVisible();
        expect(requests[0]).toEqual({
          email: 'fixture@example.invalid',
          language,
        });
        await page.goto('/reset-password#token=' + raw);
        await expect(page).toHaveURL(/\/reset-password$/);
        expect(requests.length).toBe(1);
        await page.locator('input[name="password"]').fill('NewPass1');
        await page
          .locator('input[name="passwordConfirmation"]')
          .fill('Different1');
        await page.locator('form button.primary').click();
        await expect(page.locator('main p[role="alert"]')).toBeVisible();
        expect(requests.length).toBe(1);
        await page
          .locator('input[name="passwordConfirmation"]')
          .fill('NewPass1');
        await expect(page.locator('main p[role="alert"]')).toHaveCount(0);
        await page.screenshot({
          path: 'test-results/reset-' + width + '-' + language + '.png',
        });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await page.locator('form button.primary').click();
        await expect(page.getByRole('status')).toContainText(
          language === 'ru'
            ? 'Все старые сессии завершены'
            : 'All previous sessions have ended',
        );
        expect(requests[1]).toEqual({
          token: raw,
          password: 'NewPass1',
          passwordConfirmation: 'NewPass1',
        });
        await expect(page.locator('form')).toHaveCount(0);
        await expect(
          page.getByRole('link', {
            name: language === 'ru' ? 'Вернуться ко входу' : 'Back to sign in',
          }),
        ).toBeVisible();
      },
    );
  }
}

test('expired reset links keep the form recoverable and offer a new link', async ({
  page,
}) => {
  await page.route('**/api/me', (route) =>
    route.fulfill({ json: { user: null } }),
  );
  await page.route('**/api/auth/reset-password', (route) =>
    route.fulfill({ status: 400, json: { error: 'reset.invalid' } }),
  );
  await page.goto('/reset-password#token=' + 'b'.repeat(43));
  await page.locator('input[name="password"]').fill('NewPass1');
  await page.locator('input[name="passwordConfirmation"]').fill('NewPass1');
  await page.locator('form button.primary').click();
  await expect(page.locator('main p[role="alert"]')).toContainText(
    'Ссылка недействительна',
  );
  await expect(page.locator('form button.primary')).toBeEnabled();
  await page
    .getByRole('link', { name: 'Отправить ссылку', exact: true })
    .click();
  await expect(page.locator('input[name="email"]')).toBeVisible();
});
