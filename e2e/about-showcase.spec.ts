import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('About invites instead of instructing; screenshot stack works with hover, keyboard, themes, language and reduced motion', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/about');
  await expect(page.locator('.about-workflow')).toHaveCount(0);
  await expect(page.locator('.about-shot')).toHaveCount(3);
  const shots = page.locator('.about-shot');
  await shots.first().scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      shots.evaluateAll((elements) =>
        elements.every((e) => {
          const image = e.querySelector('img')!;
          return image.complete && image.naturalWidth === 1280;
        }),
      ),
    )
    .toBeTruthy();
  const first = shots.first();
  const initial = await first.evaluate((e) => getComputedStyle(e).transform);
  const rect = await first.boundingBox();
  await page.mouse.move(
    rect!.x + rect!.width / 2,
    rect!.y + rect!.height * 0.25,
  );
  await expect
    .poll(() => first.evaluate((e) => getComputedStyle(e).zIndex))
    .toBe('5');
  await expect
    .poll(() => first.evaluate((e) => getComputedStyle(e).transform))
    .not.toBe(initial);
  await shots.last().focus();
  await expect(shots.last()).toBeFocused();
  await expect
    .poll(() => shots.last().evaluate((e) => getComputedStyle(e).zIndex))
    .toBe('5');
  await page.mouse.move(1, 1);
  await shots.last().evaluate((e) => (e as HTMLElement).blur());
  await page
    .locator('.about-showcase')
    .screenshot({ path: 'test-results/about-showcase-stage.png' });
  await page.screenshot({
    path: 'test-results/about-showcase-desktop.png',
    fullPage: true,
  });
  await page
    .getByRole('button', { name: 'Включить тёмную тему', exact: true })
    .click();
  await expect(shots.first().locator('img')).toHaveAttribute('src', /ru-dark/);
  await page
    .getByRole('button', { name: 'Переключить на английский', exact: true })
    .click();
  await expect(shots.first().locator('img')).toHaveAttribute('src', /en-dark/);
  expect(await page.locator('main').innerText()).not.toMatch(/[А-Яа-яЁё]/);
  const audit = await new AxeBuilder({ page }).include('main').analyze();
  expect(audit.violations).toEqual([]);
  await page.screenshot({
    path: 'test-results/about-showcase-desktop-dark-en.png',
    fullPage: true,
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect
    .poll(() =>
      shots.evaluateAll((elements) =>
        elements.every((e) => getComputedStyle(e).transform === 'none'),
      ),
    )
    .toBeTruthy();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page
    .locator('.about-screens')
    .evaluate((e) => e.scrollTo({ left: e.scrollWidth, behavior: 'instant' }));
  await shots.last().scrollIntoViewIfNeeded();
  await expect(shots.last()).toBeInViewport();
  await page.screenshot({
    path: 'test-results/about-showcase-mobile.png',
    fullPage: true,
  });
  const url = await shots.last().getAttribute('href');
  expect((await page.request.get(url!)).ok()).toBeTruthy();
});
