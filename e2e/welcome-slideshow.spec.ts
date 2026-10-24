import { test, expect } from '@playwright/test';

test('welcome photographs rotate, pause and preserve typed login fields', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto('/');
  const slides = page.locator('.welcome-slide');
  await expect(slides).toHaveCount(4);
  await expect
    .poll(() =>
      slides.evaluateAll((elements) =>
        elements.every(
          (image) =>
            (image as HTMLImageElement).complete &&
            (image as HTMLImageElement).naturalWidth > 0,
        ),
      ),
    )
    .toBeTruthy();
  const email = page.locator('input[name="email"]');
  await email.fill('demo_username');
  await page.locator('input[name="password"]').fill('KeepPassword123');
  await expect(page.locator('.welcome-slide.is-active')).toHaveAttribute(
    'src',
    /great-wall/,
  );
  await page.clock.runFor(7100);
  await expect(page.locator('.welcome-slide.is-active')).toHaveAttribute(
    'src',
    /pyramids/,
  );
  await expect(email).toHaveValue('demo_username');
  await expect(page.locator('.slideshow-toggle')).toHaveCount(0);
  await page.locator('.welcome-slideshow').hover();
  await page.clock.runFor(15000);
  await expect(page.locator('.welcome-slide.is-active')).toHaveAttribute(
    'src',
    /pyramids/,
  );
  await email.focus();
  await page.mouse.move(1, 1);
  await page.clock.runFor(7100);
  await expect(page.locator('.welcome-slide.is-active')).toHaveAttribute(
    'src',
    /santorini/,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: 'test-results/welcome-travel-photos-mobile.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: 'test-results/welcome-travel-photos-desktop.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // Dispatch the media-query change and its animation frame before observing it.
  await page.clock.runFor(20);
  await expect(page.locator('.slideshow-toggle')).toHaveCount(0);
  const current = await page
    .locator('.welcome-slide.is-active')
    .getAttribute('src');
  await page.clock.runFor(15000);
  await expect(page.locator('.welcome-slide.is-active')).toHaveAttribute(
    'src',
    current!,
  );
});

test('broken first photograph is skipped without leaving an empty banner', async ({
  page,
}) => {
  await page.route('**/welcome/great-wall.webp', (route) => route.abort());
  await page.goto('/');
  await expect
    .poll(() =>
      page
        .locator('.welcome-slide.is-active')
        .evaluate(
          (image) =>
            (image as HTMLImageElement).complete &&
            (image as HTMLImageElement).naturalWidth > 0,
        ),
    )
    .toBeTruthy();
  await expect(page.locator('.welcome-slide.is-active')).not.toHaveAttribute(
    'src',
    /great-wall/,
  );
});
