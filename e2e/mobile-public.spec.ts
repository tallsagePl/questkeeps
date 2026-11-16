import { expect, test } from '@playwright/test';

test.use({ isMobile: true, hasTouch: true, reducedMotion: 'reduce' });

for (const screen of [
  { width: 320, height: 568, language: 'ru', theme: 'light' },
  { width: 393, height: 852, language: 'en', theme: 'dark' },
  { width: 430, height: 932, language: 'ru', theme: 'dark' },
]) {
  test(`public pages fit a ${screen.width}px touch viewport`, async ({
    page,
  }) => {
    await page.route('**/api/me', (route) =>
      route.fulfill({ json: { user: null, yandexEnabled: false } }),
    );
    await page.setViewportSize({ width: screen.width, height: screen.height });
    await page.addInitScript(({ language, theme }) => {
      localStorage.setItem('ta-language', language);
      localStorage.setItem('ta-theme', theme);
    }, screen);

    const fits = () =>
      page.evaluate(() => ({
        width: innerWidth,
        hasOverflow: document.documentElement.scrollWidth > innerWidth,
      }));
    await page.goto('/');
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
      'content',
      /width=device-width, initial-scale=1, viewport-fit=cover/,
    );
    const register = page.getByRole('link', {
      name: screen.language === 'ru' ? 'Создать поездку' : 'Create a trip',
      exact: true,
    });
    const login = page.locator('main').getByRole('link', {
      name: screen.language === 'ru' ? 'Войти' : 'Sign in',
      exact: true,
    });
    await expect(register).toBeInViewport({ ratio: 1 });
    await expect(login).toBeInViewport({ ratio: 1 });
    expect((await register.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await fits()).toEqual({ width: screen.width, hasOverflow: false });

    await register.tap();
    const draft = page.getByRole('dialog', {
      name: screen.language === 'ru' ? 'Новое путешествие' : 'New journey',
    });
    await expect(draft).toBeVisible();
    await expect(draft.getByRole('textbox').first()).toBeInViewport();
    await page.goBack();
    const form = page.locator('#welcome-auth');
    await login.tap();
    const identifier = form.locator('input[name="email"]');
    await expect(identifier).toHaveAttribute('autocomplete', 'username');
    await expect(identifier).toHaveCSS('font-size', '16px');

    await page.goto('/about');
    const intro = page.locator('.about-intro');
    const heading = (await intro.getByRole('heading').boundingBox())!;
    const image = (await intro.getByRole('img').boundingBox())!;
    expect(image.y).toBeGreaterThan(heading.y + heading.height);
    expect(image.width).toBeGreaterThan(screen.width * 0.85);
    expect(await fits()).toEqual({ width: screen.width, hasOverflow: false });

    await page.goto('/guide');
    await expect(page.locator('header .mobile-header-menu')).toBeVisible();
    await expect(page.locator('main details')).toHaveCount(4);
    await expect(page.locator('main details[open]')).toHaveCount(0);
    const map = page.locator('details:has(#map) > summary');
    expect((await map.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expect(page.locator('#map')).toBeHidden();
    await map.tap();
    await expect(page.locator('#map')).toBeVisible();
    expect(await fits()).toEqual({ width: screen.width, hasOverflow: false });
  });
}

test('header, popover and keyboard skip link respect simulated safe areas', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');
  await page.addStyleTag({
    content:
      ':root { --safe-top: 26px; --safe-right: 14px; --safe-bottom: 22px; --safe-left: 10px; }',
  });
  const header = page.locator('header.site-header');
  const bounds = (await header.boundingBox())!;
  expect(bounds.x).toBe(10);
  expect(bounds.y).toBe(26);
  expect(bounds.width).toBe(296);

  await page.keyboard.press('Tab');
  await expect(page.locator('.skip-link')).toBeFocused();
  expect(
    (await page.locator('.skip-link').boundingBox())!.y,
  ).toBeGreaterThanOrEqual(26);
  await header.getByRole('button', { name: 'Меню', exact: true }).tap();
  const menu = page.getByRole('region', { name: 'Меню', exact: true });
  await expect(menu).toBeVisible();
  const panel = (await menu.boundingBox())!;
  expect(panel.x).toBeGreaterThanOrEqual(22);
  expect(panel.x + panel.width).toBeLessThanOrEqual(294);
  expect(panel.y + panel.height).toBeLessThanOrEqual(546);
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();

  await page.setViewportSize({ width: 844, height: 390 });
  await page.addStyleTag({
    content:
      ':root { --safe-top: 0px; --safe-right: 44px; --safe-bottom: 20px; --safe-left: 44px; }',
  });
  expect((await header.boundingBox())!.width).toBe(756);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    844,
  );
});
