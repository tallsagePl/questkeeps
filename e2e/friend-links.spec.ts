import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('friend links survive registration and login, add both people, and can be replaced or disabled', async ({
  page,
  browser,
}) => {
  const base = 'http://127.0.0.1:3101',
    unique = Date.now();
  const register = async (context: any, name: string, email: string) => {
    const r = await context.request.post(base + '/api/auth/register', {
      headers: { origin: base },
      data: { name, email, password: 'TravelPassword123' },
    });
    expect(r.ok()).toBeTruthy();
  };
  await register(
    page.context(),
    'Friend Owner',
    'owner-' + unique + '@fixture.invalid',
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/profile');
  await page
    .getByRole('button', { name: 'Сгенерировать ссылку', exact: true })
    .click();
  const field = page.getByLabel('Ссылка для друзей', { exact: true });
  await expect(field).toBeVisible();
  const url = await field.inputValue();
  const search = await page.locator('#find-people').boundingBox(),
    link = await page.locator('.friend-link-block').boundingBox();
  expect(search!.x).toBeLessThan(link!.x);
  expect(Math.abs(search!.width - link!.width)).toBeLessThan(2);
  await page.screenshot({
    path: 'test-results/friend-link-desktop.png',
    fullPage: true,
  });
  expect(
    (
      await new AxeBuilder({ page })
        .include('#friends')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  const newcomer = await browser.newContext();
  const invite = await newcomer.newPage();
  await invite.goto(url);
  await expect(
    invite.getByText(
      'Войди или зарегистрируйся, чтобы принять приглашение в друзья.',
    ),
  ).toBeVisible();
  await invite
    .getByRole('button', {
      name: 'Первый раз здесь? Зарегистрироваться',
      exact: true,
    })
    .click();
  await invite.getByLabel('Как вас зовут', { exact: true }).fill('New Friend');
  await invite
    .getByLabel('Электронная почта', { exact: true })
    .fill('new-' + unique + '@fixture.invalid');
  await invite.getByLabel('Пароль', { exact: true }).fill('TravelPassword123');
  await invite
    .getByLabel('Повторите пароль', { exact: true })
    .fill('TravelPassword123');
  await invite
    .getByRole('button', { name: 'Создать аккаунт', exact: true })
    .click();
  await expect(invite.locator('.friend-arrival')).toContainText(
    'Вы теперь друзья: Friend Owner',
  );
  await expect(invite.locator('.friends-compact .friend-row')).toContainText(
    'Friend Owner',
  );
  const existing = await browser.newContext();
  await register(
    existing,
    'Existing Friend',
    'existing-' + unique + '@fixture.invalid',
  );
  await existing.request.post(base + '/api/auth/logout', {
    headers: { origin: base },
    data: {},
  });
  const login = await existing.newPage();
  await login.goto(url);
  await login
    .getByLabel('Электронная почта или никнейм', { exact: true })
    .fill('existing-' + unique + '@fixture.invalid');
  await login.getByLabel('Пароль', { exact: true }).fill('TravelPassword123');
  await login.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(login.locator('.friend-arrival')).toContainText(
    'Вы теперь друзья: Friend Owner',
  );
  await page.reload();
  await expect(
    page.locator('#friends .friends-list').first().locator('.friend-row'),
  ).toHaveCount(2);
  await page
    .getByRole('button', { name: 'Заменить ссылку', exact: true })
    .click();
  const replacement = await field.inputValue();
  expect(replacement).not.toBe(url);
  const stranger = await browser.newContext();
  await register(
    stranger,
    'Stranger',
    'stranger-' + unique + '@fixture.invalid',
  );
  const bad = await stranger.newPage();
  await bad.goto(url);
  await expect(bad.locator('.friend-arrival')).toContainText(
    'Ссылка недействительна или истекла',
  );
  await page
    .getByRole('button', { name: 'Отключить ссылку', exact: true })
    .click();
  await expect(field).toHaveCount(0);
  await bad.goto(replacement);
  await expect(bad.locator('.friend-arrival')).toContainText(
    'Ссылка недействительна или истекла',
  );
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileSearch = await page.locator('#find-people').boundingBox(),
    mobileLink = await page.locator('.friend-link-block').boundingBox();
  expect(mobileLink!.y).toBeGreaterThan(mobileSearch!.y + mobileSearch!.height);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page
    .getByRole('button', { name: 'Переключить на английский', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Switch to dark theme', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Invite with a link', exact: true }),
  ).toBeVisible();
  expect(await page.locator('#friends').innerText()).not.toMatch(/[А-Яа-яЁё]/);
  await page.screenshot({
    path: 'test-results/friend-link-mobile-dark.png',
    fullPage: true,
  });
  await newcomer.close();
  await existing.close();
  await stranger.close();
});
