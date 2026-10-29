import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const base = 'http://127.0.0.1:3101';

const headers = { origin: base };

test('owner invites by email, recipient accepts from notifications, participation days stay marked on mobile', async ({
  browser,
}) => {
  const owner = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'reduce',
  });
  const recipient = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
  });
  const suffix = Date.now();
  const email = 'invite-person-' + suffix + '@fixture.invalid';
  try {
    for (const [context, address, name] of [
      [owner, 'invite-owner-' + suffix + '@fixture.invalid', 'Invite Owner'],
      [recipient, email, 'Invite Person'],
    ] as const) {
      const response = await context.request.post(base + '/api/auth/register', {
        headers,
        data: { email: address, name, password: 'FixturePassword123' },
      });
      expect(response.ok()).toBeTruthy();
    }
    const response = await owner.request.post(base + '/api/trips', {
      headers,
      data: {
        title: 'Shared Istanbul',
        destination: 'Istanbul',
        start: '2026-10-10',
        end: '2026-10-18',
      },
    });
    const trip = (await response.json()).id;
    const page = await owner.newPage();
    await page.goto(base + '/?trip=' + trip);
    await page.getByRole('button', { name: 'Управление поездкой' }).click();
    await page.getByRole('button', { name: 'Пригласить участника' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('В QuestKeeps', { exact: true }).check();
    await dialog.getByLabel('Никнейм или email', { exact: true }).fill(email);
    await dialog.getByRole('button', { name: /Invite Person/ }).click();
    await dialog.locator('input[name="start"]').fill('2026-10-12');
    await dialog.locator('input[name="end"]').fill('2026-10-14');
    await dialog.getByLabel('Показывать все фото поездки').check();
    await page.screenshot({ path: 'data/invite-form-desktop.png' });
    expect(
      (await new AxeBuilder({ page }).include('dialog').analyze()).violations,
    ).toEqual([]);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBeFalsy();
    await page.screenshot({ path: 'data/invite-form-mobile.png' });
    await dialog.getByRole('button', { name: 'Отправить приглашение' }).click();
    await expect(dialog).toHaveCount(0);
    const member = await recipient.newPage();
    await member.goto(base + '/about');
    await expect(member.locator('.notification-dot')).toBeVisible();
    await member.getByRole('button', { name: /Уведомления/ }).click();
    const inbox = member.getByRole('region', {
      name: 'Уведомления',
      exact: true,
    });
    await expect(
      inbox.getByRole('heading', { name: 'Shared Istanbul' }),
    ).toBeVisible();
    await expect(
      inbox.getByText('Invite Owner приглашает вас в путешествие'),
    ).toBeVisible();
    await member.screenshot({ path: 'data/invite-inbox-mobile.png' });
    expect(
      (
        await new AxeBuilder({ page: member })
          .include('.header-dropdown-panel:popover-open')
          .analyze()
      ).violations,
    ).toEqual([]);
    await inbox.getByRole('button', { name: 'Принять и открыть' }).click();
    await expect(member).toHaveURL(base + '/?trip=' + trip);
    await member.locator('.calendar-trigger').click();
    await expect(member.locator('[data-participation="true"]')).toHaveCount(3);
    await expect(member.locator('[data-date="2026-10-10"]')).toBeEnabled();
    await member.locator('.trip-calendar-popover').scrollIntoViewIfNeeded();
    await member.screenshot({ path: 'data/invite-calendar-mobile.png' });
    expect(
      await member.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBeFalsy();
    await member.keyboard.press('Escape');
    await member.reload();
    await member.getByRole('button', { name: /Уведомления/ }).click();
    await expect(member.getByText('Новых уведомлений пока нет.')).toBeVisible();
    await member.keyboard.press('Escape');
    await member.evaluate(() => {
      localStorage.setItem('ta-language', 'en');
      localStorage.setItem('ta-theme', 'dark');
    });
    await member.reload();
    await member.locator('.calendar-trigger').click();
    await expect(
      member.locator('.calendar-participation-legend'),
    ).toContainText('Your participation days');
    await member.locator('.trip-calendar-popover').scrollIntoViewIfNeeded();
    await member.screenshot({ path: 'data/invite-calendar-en-dark.png' });
    expect(
      (
        await new AxeBuilder({ page: member })
          .include('.trip-calendar-popover')
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.goto(base + '/?trip=' + trip);
    await page.getByRole('button', { name: 'Управление поездкой' }).click();
    await page.setViewportSize({ width: 1280, height: 1000 });
    const row = page.locator('.member').filter({ hasText: 'Invite Person' });
    const edit = row.getByRole('button', { name: 'Изменить', exact: true });
    await expect(edit).toBeVisible();
    expect(
      await edit.evaluate((node) => getComputedStyle(node).whiteSpace),
    ).toBe('nowrap');
    expect(
      await edit.evaluate((node) => node.scrollWidth <= node.clientWidth),
    ).toBeTruthy();
    await row.scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'data/member-action-desktop.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    await row.scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'data/member-action-mobile.png' });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
  } finally {
    await owner.close();
    await recipient.close();
  }
});
