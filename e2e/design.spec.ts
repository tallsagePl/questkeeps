import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
async function axe(page: Page, label: string) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    result.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        summary: n.failureSummary,
      })),
    })),
    label,
  ).toEqual([]);
}
test('RU/EN, обе темы, сохранение предпочтений и контраст входа', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Рады вас видеть' }),
  ).toBeVisible();
  await axe(page, 'Russian light welcome');
  await page
    .getByRole('button', { name: 'Включить тёмную тему', exact: true })
    .click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await axe(page, 'Russian dark welcome');
  await page.screenshot({
    path: 'test-results/welcome-ru-dark.png',
    fullPage: true,
  });
  await page
    .getByRole('button', { name: 'Переключить на английский', exact: true })
    .click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(
    page.getByRole('heading', { name: 'Good to see you', exact: true }),
  ).toBeVisible();
  expect(await page.locator('main').innerText()).not.toMatch(/[А-Яа-яЁё]/);
  await axe(page, 'English dark welcome');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page
    .getByRole('button', { name: 'Switch to light theme', exact: true })
    .click();
  await axe(page, 'English light welcome');
  await page
    .getByLabel('Email or @username', { exact: true })
    .fill('incorrect@example.test');
  await page.getByLabel('Password', { exact: true }).fill('WrongPassword123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(
    page.getByText('Incorrect email, username or password', { exact: true }),
  ).toBeVisible();
  await axe(page, 'English invalid inputs');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: 'test-results/welcome-en-light-mobile.png',
    fullPage: true,
  });
  await page
    .getByRole('button', { name: 'Switch to Russian', exact: true })
    .click();
  await expect(
    page.getByText('Неверный email, никнейм или пароль', { exact: true }),
  ).toBeVisible();
});
test('English owner screens, keyboard dialogs, journal, invitation and guest', async ({
  page,
  browser,
}) => {
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Переключить на английский', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'New here? Create an account' })
    .click();
  await page.getByLabel('Your name').fill('Reviewer');
  await page
    .getByLabel('Email', { exact: true })
    .fill('review-' + Date.now() + '@example.test');
  await page.getByLabel('Password', { exact: true }).fill('TravelPassword123');
  await page
    .getByRole('button', { name: 'Create account', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Your travels.' }),
  ).toBeVisible();
  await axe(page, 'English dashboard');
  await page.getByRole('button', { name: 'New trip', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'New journey', exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'New trip', exact: true }),
  ).toBeFocused();
  await page.getByRole('button', { name: 'New trip', exact: true }).click();
  await page.getByLabel('Trip name').fill('Autumn trip');
  await page
    .getByRole('combobox', { name: 'Country', exact: true })
    .fill('Georgia');
  await page.getByRole('option', { name: 'Georgia', exact: true }).click();
  await page.getByLabel('Start', { exact: true }).fill('2026-10-10');
  await page.getByLabel('End', { exact: true }).fill('2026-10-18');
  await axe(page, 'English create dialog');
  await page.getByRole('button', { name: 'Create trip', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Autumn trip.' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Switch to dark theme', exact: true })
    .click();
  await axe(page, 'English dark gallery');
  await page.getByRole('button', { name: 'Map', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Map of trip photos' }),
  ).toBeVisible();
  await axe(page, 'English dark map');
  await page.getByRole('button', { name: 'Journal', exact: true }).click();
  await page.getByLabel('What will you remember?').fill('The mountain road.');
  await page.getByRole('button', { name: 'Save entry', exact: true }).click();
  await expect(
    page.getByText('The mountain road.', { exact: true }),
  ).toBeVisible();
  await axe(page, 'English dark journal');
  await page
    .getByRole('button', { name: 'Members & Drives', exact: true })
    .click();
  await axe(page, 'English dark settings');
  await page
    .getByRole('button', { name: 'Invite a member', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Create invitation', exact: true })
    .click();
  const invite = await page.getByLabel('Invitation link').inputValue();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Create link', exact: true }).click();
  const share = await page.getByLabel('Guest link').inputValue();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await guest.goto(share);
  await guest
    .getByRole('button', { name: 'Переключить на английский', exact: true })
    .click();
  await expect(guest.getByText('Guest view', { exact: true })).toBeVisible();
  await guest.getByRole('button', { name: 'Journal', exact: true }).click();
  await expect(
    guest.getByText('The mountain road.', { exact: true }),
  ).toBeVisible();
  await axe(guest, 'English guest journal');
  await guest.goto(invite);
  await expect(
    guest.getByRole('heading', { name: 'You are invited on a trip' }),
  ).toBeVisible();
  await guest
    .getByRole('button', { name: 'New here? Create an account' })
    .click();
  await guest.getByLabel('Your name').fill('Member');
  await guest
    .getByLabel('Email', { exact: true })
    .fill('member-' + Date.now() + '@example.test');
  await guest.getByLabel('Password', { exact: true }).fill('TravelPassword123');
  await guest
    .getByRole('button', { name: 'Create account', exact: true })
    .click();
  await guest.getByRole('button', { name: 'Join trip', exact: true }).click();
  await expect(
    guest.getByRole('heading', { name: 'Autumn trip.' }),
  ).toBeVisible();
  await guest
    .getByRole('button', { name: 'Members & Drives', exact: true })
    .click();
  await expect(
    guest.getByRole('button', { name: 'Invite a member', exact: true }),
  ).toHaveCount(0);
  await expect(
    guest.getByRole('button', { name: 'Leave trip', exact: true }),
  ).toBeVisible();
  await axe(guest, 'English member settings');
  await guest.getByRole('button', { name: 'Leave trip', exact: true }).click();
  await guest
    .getByRole('dialog')
    .getByRole('button', { name: 'Leave trip', exact: true })
    .click();
  await expect(
    guest.getByRole('heading', { name: 'Your travels.' }),
  ).toBeVisible();
  await guestContext.close();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: 'test-results/settings-en-dark-mobile.png',
    fullPage: true,
  });
});
test('system theme follows device changes and zoom keeps controls available', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.setViewportSize({ width: 640, height: 900 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  await expect(
    page.getByRole('button', {
      name: 'Переключить на английский',
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByLabel('Пароль', { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});
