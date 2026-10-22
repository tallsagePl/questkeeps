import { test, expect } from '@playwright/test';
async function register(page: any) {
  const result = await page.request.post('/api/auth/register', {
    headers: { origin: 'http://127.0.0.1:3101' },
    data: {
      name: 'Back Tester',
      email:
        'navigation-' + Date.now() + '-' + Math.random() + '@fixture.invalid',
      password: 'TravelPassword123',
    },
  });
  expect(result.ok()).toBeTruthy();
  return (await result.json()).user;
}
test('back returns from own public profile to settings, then previous page; direct entry is safe', async ({
  page,
  context,
}) => {
  const user = await register(page);
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Ваши путешествия.' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Назад', exact: true }),
  ).toHaveCount(0);
  await page.locator('.user-button').click();
  await expect(page).toHaveURL('/profile');
  await page.getByRole('link', { name: 'Как меня видят', exact: true }).click();
  await expect(page).toHaveURL('/@' + user.username);
  await page.getByRole('button', { name: 'Назад', exact: true }).click();
  await expect(page).toHaveURL('/profile');
  await expect(page.locator('.profile-name-display')).toContainText(user.name);
  await page.getByRole('button', { name: 'Назад', exact: true }).click();
  await expect(page).toHaveURL('/');
  await page
    .getByRole('link', { name: 'О проекте', exact: true })
    .first()
    .click();
  await expect(page).toHaveURL('/about');
  await page.reload();
  await page.getByRole('button', { name: 'Назад', exact: true }).click();
  await expect(page).toHaveURL('/');
  const direct = await context.newPage();
  await direct.goto('/@' + user.username);
  await direct.getByRole('button', { name: 'Назад', exact: true }).click();
  await expect(direct).toHaveURL('/');
  await direct.close();
});
test('trip tabs restore back, forward and after reload; main has no back button', async ({
  page,
}) => {
  await register(page);
  const created = await page.request.post('/api/trips', {
    headers: { origin: 'http://127.0.0.1:3101' },
    data: {
      title: 'Navigation trip',
      destination: 'Fixture',
      start: '2026-10-10',
      end: '2026-10-18',
    },
  });
  expect(created.ok()).toBeTruthy();
  await page.goto('/');
  await page
    .locator('.trip-card')
    .filter({ hasText: 'Navigation trip' })
    .click();
  await expect(page.locator('.trip-heading')).toContainText('Navigation trip');
  const nav = page.getByRole('navigation', { name: 'Разделы поездки' });
  await nav.getByRole('button', { name: 'Дневник', exact: true }).click();
  await expect(
    nav.getByRole('button', { name: 'Дневник', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await page.locator('.user-button').click();
  await expect(page).toHaveURL('/profile');
  await page.getByRole('button', { name: 'Назад', exact: true }).click();
  await expect(page.locator('.trip-heading')).toContainText('Navigation trip');
  await expect(
    nav.getByRole('button', { name: 'Дневник', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await page.reload();
  await expect(
    nav.getByRole('button', { name: 'Дневник', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await page.getByRole('button', { name: 'Назад', exact: true }).click();
  await expect(
    nav.getByRole('button', { name: 'Галерея', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await page.goForward();
  await expect(
    nav.getByRole('button', { name: 'Дневник', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await page.getByRole('button', { name: 'Назад', exact: true }).click();
  await page.getByRole('button', { name: 'Назад', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Ваши путешествия.' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Назад', exact: true }),
  ).toHaveCount(0);
});
test('a late trip response cannot undo Back', async ({ page }) => {
  await page.route('**/api/me', (r) =>
    r.fulfill({ json: { user: { id: 'fixture', name: 'Fixture' } } }),
  );
  const trip = {
    id: 'slow',
    title: 'Slow trip',
    destination: 'Fixture',
    start: '2026-10-10',
    end: '2026-10-18',
    from: '2026-10-10',
    to: '2026-10-18',
    role: 'owner',
  };
  await page.route('**/api/trips', (r) =>
    r.fulfill({ json: { trips: [trip] } }),
  );
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/api/trips/slow', async (r) => {
    await gate;
    await r.fulfill({ json: { trip, media: [], notes: [], places: [] } });
  });
  await page.goto('/');
  await expect(page.locator('.trip-card')).toBeVisible();
  const started = page.waitForRequest((r) =>
    r.url().endsWith('/api/trips/slow'),
  );
  await page.locator('.trip-card').click();
  await started;
  await page.goBack();
  await expect(page).toHaveURL('/');
  const done = page.waitForResponse((r) => r.url().endsWith('/api/trips/slow'));
  release();
  await done;
  await expect(
    page.getByRole('heading', { name: 'Ваши путешествия.' }),
  ).toBeVisible();
  await expect(page.locator('.trip-heading')).toHaveCount(0);
});
