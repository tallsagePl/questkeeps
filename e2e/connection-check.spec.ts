import { test, expect } from '@playwright/test';

test('standalone connection check works without app bundles or account cookies', async ({
  page,
}) => {
  await page.context().addCookies([
    {
      name: 'ta_session',
      value: 'fixture-private-session',
      url: 'http://127.0.0.1:3101',
    },
  ]);
  const requests: string[] = [];
  await page.route('**/api/me?connection-check=*', async (route) => {
    expect(route.request().headers().cookie).toBeUndefined();
    requests.push('api');
    await route.fulfill({ json: { user: null } });
  });
  await page.route(
    '**/welcome/santorini.webp?connection-check=*',
    async (route) => {
      expect(route.request().headers().cookie).toBeUndefined();
      requests.push('image');
      await route.continue();
    },
  );
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto('/connection-check.html');
  await expect(page.locator('script[src]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Проверить соединение' }).click();
  await expect(page.getByRole('status')).toContainText(
    'Public image: HTTP 200, 67332 bytes',
  );
  await expect(page.getByRole('status')).toContainText('API: HTTP 200');
  await expect(
    page.getByRole('button', { name: 'Скопировать результат' }),
  ).toBeVisible();
  expect(requests).toEqual(['api', 'image']);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});
