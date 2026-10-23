import { test, expect, type Page } from '@playwright/test';

async function footerAtBottom(page: Page) {
  const metrics = await page.locator('footer').evaluate((footer) => ({
    bottom: footer.getBoundingClientRect().bottom + scrollY,
    page: Math.max(document.documentElement.scrollHeight, innerHeight),
  }));
  expect(Math.abs(metrics.bottom - metrics.page)).toBeLessThanOrEqual(1);
}

for (const viewport of [
  { width: 1743, height: 1244 },
  { width: 390, height: 844 },
]) {
  test(`footer stays at the bottom during loading, errors and short pages at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.route('**/api/me', () => {});
    await page.goto('/');
    await expect(page.locator('main')).toContainText('Открываем архив');
    await footerAtBottom(page);
    await page.unroute('**/api/me');
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Рады вас видеть', exact: true }),
    ).toBeVisible();
    await footerAtBottom(page);
    await page.goto('/auth/error?reason=access_denied');
    await expect(
      page.getByRole('heading', { name: 'Не удалось завершить подключение' }),
    ).toBeVisible();
    await footerAtBottom(page);
    await page.goto('/profile');
    await expect(page.locator('main')).toBeVisible();
    await footerAtBottom(page);
  });
}

test('logo returns from About to a working archive without script failures', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.url().includes('/_next/static/') && response.status() >= 400)
      errors.push(response.status() + ' ' + response.url());
  });
  await page.goto('/about');
  await page
    .getByRole('link', { name: 'QuestKeeps', exact: true })
    .first()
    .click();
  await expect(
    page.getByRole('heading', { name: 'Рады вас видеть', exact: true }),
  ).toBeVisible();
  await footerAtBottom(page);
  expect(errors).toEqual([]);
});

test('a hanging session check becomes a retryable error instead of an endless spinner', async ({
  page,
}) => {
  await page.route('**/api/me', () => {});
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Не удалось открыть архив' }),
  ).toBeVisible({ timeout: 15000 });
  await expect(
    page.getByRole('button', { name: 'Повторить', exact: true }),
  ).toBeVisible();
  await expect(page.locator('input[name="password"]')).toHaveCount(0);
  await footerAtBottom(page);
  await page.unroute('**/api/me');
  await page.getByRole('button', { name: 'Повторить', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Рады вас видеть', exact: true }),
  ).toBeVisible();
});

test('logo can recover a failed archive even when already on the home URL', async ({
  page,
}) => {
  let requests = 0;
  await page.route('**/api/me', (route) => {
    requests++;
    return requests === 1
      ? route.fulfill({ status: 503, json: { error: 'Fixture unavailable' } })
      : route.continue();
  });
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Не удалось открыть архив' }),
  ).toBeVisible();
  await page
    .getByRole('link', { name: 'QuestKeeps', exact: true })
    .first()
    .click();
  await expect(
    page.getByRole('heading', { name: 'Рады вас видеть', exact: true }),
  ).toBeVisible();
  expect(requests).toBeGreaterThan(1);
});
