import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import sharp from 'sharp';
test('profile files stay collapsed, load bounded pages and previews, open modal, and keep footer at bottom', async ({
  page,
}) => {
  await page.request.post('/api/auth/register', {
    headers: { origin: 'http://127.0.0.1:3101' },
    data: {
      name: 'Library Tester',
      email: 'library-' + Date.now() + '@fixture.invalid',
      password: 'TravelPassword123',
    },
  });
  const image = await sharp({
    create: { width: 64, height: 64, channels: 3, background: '#3148f5' },
  })
    .png()
    .toBuffer();
  let pages = 0,
    previews = 0;
  const files = Array.from({ length: 65 }, (_, i) => ({
    id: 'file-' + i,
    name: 'Photo ' + i + '.jpg',
    title: i === 0 ? 'Вечер у Босфора' : null,
    kind: 'photo',
    taken: '2026-10-13T12:00:00',
    revision: '1',
    hidden: 0,
    missing: 0,
  }));
  await page.route('**/api/my-media/groups', (r) =>
    r.fulfill({
      json: {
        groups: [{ id: 'trip-fixture', title: 'A remembered trip', count: 65 }],
      },
    }),
  );
  await page.route('**/api/my-media?*', (r) => {
    pages++;
    const c = new URL(r.request().url()).searchParams.get('cursor'),
      start = c ? Number(c) : 0;
    return r.fulfill({
      json: {
        media: files.slice(start, start + 30),
        next: start + 30 < 65 ? String(start + 30) : null,
      },
    });
  });
  await page.route('**/api/my-media/file-*/preview?*', (r) => {
    previews++;
    return r.fulfill({
      body: image,
      contentType: 'image/png',
    });
  });
  let releaseUpdate: () => void = () => {},
    holdUpdate = false;
  const updateGate = new Promise<void>((resolve) => {
    releaseUpdate = resolve;
  });
  await page.route('**/api/media/file-*', async (r) => {
    if (holdUpdate) await updateGate;
    return r.fulfill({ json: { ok: true } });
  });
  await page.route('**/api/my-media/file-*/original?*', (r) =>
    r.fulfill({ status: 404 }),
  );
  await page.goto('/profile');
  const toggle = page.getByRole('button', { name: 'A remembered trip 65' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(pages).toBe(0);
  expect(previews).toBe(0);
  await expect(page.locator('#friends .friends-heading a')).toHaveCount(0);
  await expect(page.locator('#friends .friends-empty a')).toHaveCount(0);
  await expect(page.locator('#profile-settings>a')).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: 'Как меня видят' }),
  ).toBeVisible();
  await toggle.click();
  await expect(page.locator('.profile-file-row').first()).toBeVisible();
  expect(pages).toBe(1);
  await expect(page.locator('.profile-file-row strong').first()).toHaveText(
    'Вечер у Босфора',
  );
  await expect(page.locator('.profile-file-row strong').nth(1)).toHaveText(
    'Photo 1',
  );
  expect(await page.locator('.profile-file-row').count()).toBeLessThanOrEqual(
    15,
  );
  await expect(
    page.locator('.profile-file-row').first().locator('.media-preview'),
  ).toHaveAttribute('data-state', 'loaded');
  for (const theme of ['light', 'dark']) {
    await page.evaluate(
      (theme) => (document.documentElement.dataset.theme = theme),
      theme,
    );
    expect(
      (
        await new AxeBuilder({ page })
          .include('#main-content')
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
  }
  await page.evaluate(() => (document.documentElement.dataset.theme = 'light'));
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: 'test-results/profile-files-expanded.png',
    fullPage: true,
  });
  await page.locator('.profile-file-row').first().click();
  await expect(
    page.getByRole('dialog', { name: 'Вечер у Босфора' }),
  ).toBeVisible();
  await expect(
    page.getByRole('dialog').getByRole('button', { name: 'Скрыть мой кадр' }),
  ).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCSS('opacity', '1');
  expect(
    (
      await new AxeBuilder({ page })
        .include('dialog')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Скрыть мой кадр', exact: true })
    .click();
  await expect(
    page
      .getByRole('dialog')
      .getByRole('button', { name: 'Показать', exact: true }),
  ).toBeVisible();
  holdUpdate = true;
  const patchStarted = page.waitForRequest(
    (r) => r.method() === 'PATCH' && r.url().includes('/api/media/file-'),
  );
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Показать', exact: true })
    .click();
  await patchStarted;
  await page.keyboard.press('Escape');
  const patchDone = page.waitForResponse(
    (r) =>
      r.request().method() === 'PATCH' && r.url().includes('/api/media/file-'),
  );
  releaseUpdate();
  await patchDone;
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.profile-file-row').first()).not.toContainText(
    'Скрыто',
  );

  await expect(page.locator('.profile-file-row').first()).toBeFocused();
  await page
    .locator('.profile-file-scroll')
    .evaluate((el) => (el.scrollTop = el.scrollHeight));
  await expect.poll(() => pages).toBe(2);
  expect(await page.locator('.profile-file-row').count()).toBeLessThanOrEqual(
    15,
  );
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect
    .poll(async () =>
      page
        .locator('.smooth-collapse')
        .evaluate((el) => el.getBoundingClientRect().height),
    )
    .toBe(0);
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: 'test-results/profile-library-desktop.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: 'test-results/profile-library-mobile.png',
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const me = await (await page.request.get('/api/me')).json();
  await page.goto('/@' + me.user.username);
  await expect(
    page.getByRole('link', { name: 'К путешествиям', exact: true }),
  ).toHaveCount(0);
  const footer = page.locator('footer');
  await expect(footer).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Редактировать профиль', exact: true }),
  ).toBeVisible();
  const metrics = await page.evaluate(() => {
    const element = document.querySelector('footer')!,
      rect = element.getBoundingClientRect();
    return {
      footerBottom: rect.bottom + scrollY,
      pageBottom: Math.max(innerHeight, document.documentElement.scrollHeight),
      rect: { top: rect.top, height: rect.height },
      scrollY,
      body: document.body.getBoundingClientRect().height,
      shell: document.querySelector('.social-shell')?.getBoundingClientRect()
        .height,
    };
  });
  expect(Math.abs(metrics.footerBottom - metrics.pageBottom)).toBeLessThan(3);
});
