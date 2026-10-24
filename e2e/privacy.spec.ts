import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

for (const width of [390, 1440]) {
  test(`public privacy page is bilingual, accessible and fits at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/privacy');
    await expect(page.locator('article[lang="ru"]')).toContainText(
      'Обратная связь в Telegram',
    );
    await expect(page.locator('article[lang="en"]')).toContainText(
      'Telegram feedback',
    );
    await expect(page.locator('footer a[href="/privacy"]')).toHaveText(
      'Конфиденциальность',
    );
    await page
      .getByRole('navigation', { name: 'Язык документа / Document language' })
      .getByRole('link', { name: 'English' })
      .click();
    await expect(page).toHaveURL(/#en$/);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    for (const theme of ['light', 'dark']) {
      await page.evaluate(
        (value) => (document.documentElement.dataset.theme = value),
        theme,
      );
      const result = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      expect(result.violations).toEqual([]);
      await page.screenshot({
        path: `data/privacy-${width}-${theme}.png`,
        fullPage: false,
      });
    }
    if (width <= 700)
      await page.getByRole('button', { name: 'Меню', exact: true }).click();
    await page
      .getByRole('button', { name: 'Переключить на английский' })
      .click();
    if (width <= 700) await page.keyboard.press('Escape');
    await expect(page.locator('footer a[href="/privacy"]')).toHaveText(
      'Privacy',
    );
    await expect(page.locator('article[lang="ru"]')).toBeAttached();
  });
}

test('both policies and privacy footer link are available without JavaScript', async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/privacy');
  await expect(page.locator('article[lang="ru"]')).toContainText(
    'Какие данные сохраняет сайт',
  );
  await expect(page.locator('article[lang="en"]')).toContainText(
    'Data stored by the website',
  );
  await expect(page.locator('footer a[href="/privacy"]')).toBeAttached();
  await context.close();
});
