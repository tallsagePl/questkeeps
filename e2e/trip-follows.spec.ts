import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const base = 'http://127.0.0.1:3101';

const headers = { origin: base };

test('anonymous follow survives sign-in, persists in the archive, works on mobile and ends when the link is replaced', async ({
  browser,
}) => {
  const owner = await browser.newContext();
  const follower = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const suffix = Date.now();
  const email = 'follow-viewer-' + suffix + '@fixture.invalid';
  const password = 'FixturePassword123';
  try {
    await owner.request.post(base + '/api/auth/register', {
      headers,
      data: {
        email: 'follow-owner-' + suffix + '@fixture.invalid',
        name: 'Follow Owner',
        password,
      },
    });
    await owner.request.post(base + '/api/trips', {
      headers,
      data: {
        title: 'Follow Istanbul',
        destination: 'Istanbul',
        start: '2026-10-10',
        end: '2026-10-18',
      },
    });
    const trip = (await (await owner.request.get(base + '/api/trips')).json())
      .trips[0];
    const link = (
      await (
        await owner.request.post(base + '/api/trips/' + trip.id + '/share', {
          headers,
          data: { enabled: true },
        })
      ).json()
    ).url;
    await follower.request.post(base + '/api/auth/register', {
      headers,
      data: { email, name: 'Follow Viewer', password },
    });
    await follower.clearCookies();
    const page = await follower.newPage();
    await page.goto(link);
    await expect(
      page.getByRole('button', { name: 'Следить', exact: true }),
    ).toBeVisible();
    const pos = await page.locator('.trip-heading-side').evaluate((el) => ({
      top: el.getBoundingClientRect().top,
      width: innerWidth,
    }));
    expect(pos.top).toBeLessThan(500);
    await page.screenshot({ path: 'data/follow-desktop.png' });
    await page.getByRole('button', { name: 'Следить', exact: true }).click();
    await expect(page).toHaveURL(/\?follow=1$/);
    await expect(
      page.getByText('Войдите или создайте аккаунт, чтобы сохранить поездку.', {
        exact: false,
      }),
    ).toBeVisible();
    await page
      .getByLabel('Электронная почта или никнейм', { exact: true })
      .fill(email);
    await page.getByLabel('Пароль', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Войти', exact: true }).click();
    await expect(page).toHaveURL(/\/s\//);
    await expect(
      page.getByRole('button', { name: 'Отслеживается', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await page.reload();
    await expect(
      page.getByRole('button', { name: 'Отслеживается', exact: true }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Путешествия', exact: true }).click();
    const collection = page.getByRole('region', {
      name: 'Отслеживаемые путешествия',
    });
    await expect(
      collection.getByRole('link', { name: /Follow Istanbul/ }),
    ).toBeVisible();
    await collection.getByRole('link', { name: /Follow Istanbul/ }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      page.getByRole('button', { name: 'Отслеживается', exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const accessibility = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(accessibility.violations).toEqual([]);
    await page.screenshot({ path: 'data/follow-mobile.png' });
    await page
      .getByRole('button', { name: 'Отслеживается', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Следить', exact: true }),
    ).toHaveAttribute('aria-pressed', 'false');
    await page.getByRole('button', { name: 'Следить', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Отслеживается', exact: true }),
    ).toBeVisible();
    await owner.request.post(base + '/api/trips/' + trip.id + '/share', {
      headers,
      data: { enabled: true },
    });
    expect(
      (await (await follower.request.get(base + '/api/follows')).json()).trips,
    ).toEqual([]);
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'Ваши путешествия.', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Отслеживаемые путешествия' }),
    ).toHaveCount(0);
    await page.goto(link);
    await expect(
      page.getByRole('heading', { name: 'Ссылка недоступна', exact: true }),
    ).toBeVisible();
  } finally {
    await owner.close();
    await follower.close();
  }
});
