import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('friends are consensual and private, profile is a page, About works in both languages and themes', async ({
  browser,
}) => {
  test.setTimeout(90000);
  const base = 'http://127.0.0.1:3101';
  const suffix = Date.now().toString(36);
  const origin = { origin: base };
  const a = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const b = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const aliceEmail = 'social-a-' + suffix + '@fixture.invalid';
  const bobEmail = 'social-b-' + suffix + '@fixture.invalid';
  try {
    const ar = await a.request.post(base + '/api/auth/register', {
      headers: origin,
      data: {
        email: aliceEmail,
        password: 'TravelPassword123',
        name: 'Алиса ' + suffix,
      },
    });
    expect(ar.ok()).toBeTruthy();
    const alice = (await ar.json()).user;
    const br = await b.request.post(base + '/api/auth/register', {
      headers: origin,
      data: {
        email: bobEmail,
        password: 'TravelPassword123',
        name: 'Борис ' + suffix,
      },
    });
    expect(br.ok()).toBeTruthy();
    const bob = (await br.json()).user;
    const savedUsername = await b.request.patch(base + '/api/me', {
      headers: origin,
      data: { username: 'friends' },
    });
    expect(savedUsername.ok()).toBeTruthy();
    bob.username = 'friends';
    const planned = await b.request.post(base + '/api/trips', {
      headers: origin,
      data: {
        title: 'Bob-shared-' + suffix,
        destination: 'Fixture',
        start: '2026-10-01',
        end: '2026-10-02',
      },
    });
    expect(planned.ok()).toBeTruthy();
    const tripId = (await planned.json()).id;
    const shared = await b.request.post(
      base + '/api/trips/' + tripId + '/share',
      {
        headers: origin,
        data: { enabled: true },
      },
    );
    expect(shared.ok()).toBeTruthy();
    const link = new URL((await shared.json()).url);
    const followed = await a.request.post(base + '/api/follows', {
      headers: origin,
      data: { token: link.pathname.split('/').at(-1) },
    });
    expect(followed.ok()).toBeTruthy();
    await a.request.post(base + '/api/trips', {
      headers: origin,
      data: {
        title: 'Alice-private-' + suffix,
        destination: 'Fixture',
        start: '2026-10-10',
        end: '2026-10-18',
      },
    });
    const page = await a.newPage();
    const other = await b.newPage();
    await page.goto(base + '/profile');
    await expect(
      page.getByRole('heading', { name: 'Мой профиль.' }),
    ).toBeVisible();
    await expect(page.locator('dialog')).toHaveCount(0);
    await expect(page.locator('.friends-section')).toHaveCount(0);
    await page.getByRole('link', { name: 'Друзья', exact: true }).click();
    await expect(page).toHaveURL(base + '/people/friends');
    await page.getByLabel('Имя или @юзернейм').fill(bob.username);
    const result = page
      .locator('.find-people .friend-row')
      .filter({ hasText: bob.name });
    await expect(result).toBeVisible();
    await result.getByRole('button', { name: 'Добавить в друзья' }).click();
    await expect(
      result.getByText('Заявка отправлена', { exact: true }),
    ).toBeVisible();
    await other.goto(base + '/people/friends');
    const incoming = other
      .locator('.friend-requests .friend-row')
      .filter({ hasText: alice.name });
    await expect(incoming).toBeVisible();
    await incoming.getByRole('button', { name: 'Принять заявку' }).click();
    await expect(
      other.locator('.friends-section > .friends-list'),
    ).toContainText(alice.name);
    await expect(other.getByText('Нет доступных вам поездок')).toBeVisible();
    await expect(other.getByText('Alice-private-' + suffix)).toHaveCount(0);
    await page.goto(base + '/');
    const preview = page.locator('.friends-compact');
    await expect(preview).toContainText(bob.name);
    await expect(
      preview.getByRole('link', { name: 'Все друзья', exact: true }),
    ).toHaveAttribute('href', '/people/friends');
    await page.getByRole('link', { name: 'Друзья', exact: true }).click();
    await expect(
      page.locator('.friends-section > .friends-list'),
    ).toContainText(bob.name);
    const friendTrip = page.getByRole('link', { name: /Bob-shared-/ });
    await expect(friendTrip).toHaveAttribute('href', link.pathname);
    await friendTrip.click();
    await expect(page).toHaveURL(link.href);
    await expect(
      page.getByText('Гостевой просмотр', { exact: true }).first(),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Друзья', exact: true }).click();
    await page
      .locator('.friends-section > .friends-list .friend-person')
      .click();
    await expect(page).toHaveURL(base + '/@friends');
    await expect(
      page.getByRole('heading', { name: bob.name, exact: true }),
    ).toBeVisible();
    await expect(page.getByText(bobEmail, { exact: true })).toHaveCount(0);
    await page.evaluate(() => {
      let copiedLink = '';
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (text: string) => {
            copiedLink = text;
          },
          readText: async () => copiedLink,
        },
      });
    });
    await expect(page.locator('.public-profile-handle')).toHaveText(
      '@' + bob.username,
    );
    await page.locator('.public-profile-handle').click();
    await expect(
      page.locator('.public-person-identity').getByRole('status'),
    ).toHaveText('Ссылка скопирована');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      base + '/@' + bob.username,
    );
    await expect(
      page
        .locator('.public-person-actions')
        .getByRole('button', { name: 'Скопировать ссылку', exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Удалить из друзей', exact: true }),
    ).toBeVisible();
    await page.goto(base + '/profile');
    await page.getByRole('button', { name: /Уведомления/ }).click();
    await expect(
      page.getByRole('region', { name: 'Уведомления', exact: true }),
    ).toContainText('Заявка в друзья принята: ' + bob.name);
    await page.keyboard.press('Escape');
    await expect(page.locator('.profile-name-display')).toContainText(
      alice.name,
    );
    await expect(page.locator('.friends-section')).toHaveCount(0);
    await page.screenshot({
      path: 'test-results/social-profile-desktop.png',
      fullPage: true,
    });
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value;
        localStorage.setItem('ta-theme', value);
      }, theme);
      const axe = await new AxeBuilder({ page })
        .include('#main-content')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      expect(axe.violations).toEqual([]);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    await page.screenshot({
      path: 'test-results/social-profile-mobile-dark.png',
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Меню', exact: true }).click();
    await page.getByRole('link', { name: 'Друзья', exact: true }).click();
    await expect(page).toHaveURL(base + '/people/friends');
    await expect(
      page.locator('.friends-section > .friends-list'),
    ).toContainText(bob.name);
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    await page.screenshot({
      path: 'test-results/social-friends-mobile-dark.png',
      fullPage: true,
    });
    await page.goto(base + '/about');
    await expect(
      page.getByRole('heading', { name: 'Оригиналы и доступ' }),
    ).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    await page.screenshot({
      path: 'test-results/social-about-mobile-dark.png',
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Меню', exact: true }).click();
    await page
      .getByRole('button', { name: 'Переключить на английский', exact: true })
      .click();
    await page.keyboard.press('Escape');
    await expect(
      page.getByRole('heading', { name: 'Originals and access' }),
    ).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.evaluate(() => {
      localStorage.setItem('ta-theme', 'light');
      document.documentElement.dataset.theme = 'light';
    });
    await page.screenshot({
      path: 'test-results/social-about-desktop-en.png',
      fullPage: true,
    });
    const stale = await a.newPage();
    await stale.goto(base + '/profile');
    await expect(stale.locator('.profile-name-display')).toContainText(
      alice.name,
    );
    // Switching accounts navigates away from all private React state, including failed old requests.
    await page.evaluate(() => localStorage.setItem('ta-language', 'ru'));
    await page.goto(base + '/profile');
    await page.getByRole('button', { name: 'Выйти', exact: true }).click();
    await expect(page).toHaveURL(base + '/');
    await expect(
      stale.getByText('Войдите, чтобы настроить профиль.'),
    ).toBeVisible();
    await page.getByLabel('Электронная почта').fill(bobEmail);
    await page.getByLabel('Пароль', { exact: true }).fill('TravelPassword123');
    await page.getByRole('button', { name: 'Войти', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Ваши путешествия.' }),
    ).toBeVisible();
    await expect(
      page.getByText('Alice-private-' + suffix, { exact: true }),
    ).toHaveCount(0);
    await page.locator('.user-button').click();
    await expect(page).toHaveURL(base + '/profile');
    await expect(page.locator('.profile-name-display')).toContainText(bob.name);
    await expect(stale.locator('.profile-name-display')).toContainText(
      bob.name,
    );
    await expect(page.getByText(aliceEmail, { exact: true })).toHaveCount(0);
  } finally {
    await b.request
      .patch(base + '/api/me', {
        headers: origin,
        data: { username: 'boris_' + suffix },
      })
      .catch(() => {});
    await a.close();
    await b.close();
  }
});
