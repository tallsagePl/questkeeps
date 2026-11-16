import { test, expect } from '@playwright/test';

const alice = {
  id: 'alice',
  name: 'Алиса',
  username: 'alice',
  hasAvatar: false,
};

const bob = { id: 'bob', name: 'Борис', username: 'bob', hasAvatar: false };

test('new profile notification links to settings and is marked read in the bell', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const profileCompletion = 'profile-completion';
  let seen: string[] = [];
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/invitations/read') {
      seen = route.request().postDataJSON().keys;
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({
      json:
        path === '/api/me'
          ? { user: alice, yandexEnabled: true }
          : {
              invitations: [],
              count: 0,
              friends: { friends: [], incoming: [], outgoing: [] },
              trips: [],
              profileCompletion,
              seen,
            },
    });
  });
  await page.goto('/');
  await expect(page.locator('.notification-dot')).toBeVisible();
  await page.getByRole('button', { name: /Уведомления/ }).click();
  const inbox = page.getByRole('region', { name: 'Уведомления', exact: true });
  await expect(
    inbox.getByRole('heading', { name: 'Дополните профиль' }),
  ).toBeVisible();
  const profile = inbox.getByRole('link', { name: 'Открыть профиль' });
  await expect(profile).toHaveAttribute('href', '/profile');
  await expect.poll(() => seen).toEqual([profileCompletion]);
  await expect(page.locator('.notification-dot')).toHaveCount(0);
  await profile.click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.locator('.notification-dot')).toHaveCount(0);
});

test('friend changes and Drive imports update the friends page and bell without reloading', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.clock.install();
  let lists = {
    friends: [] as (typeof alice)[],
    incoming: [] as (typeof alice)[],
    outgoing: [alice],
  };
  let drive = [
    {
      id: 'frame',
      title: 'Новые воспоминания',
      count: 0,
      newest: 0,
      stamp: 'empty',
    },
  ];
  let accepted: (typeof alice)[] = [];
  let seen: string[] = [];
  let polls = 0;
  let checks = 0;
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/invitations') {
      polls++;
      return route.fulfill({
        json: {
          invitations: [],
          count: 0,
          friends: lists,
          drive,
          accepted,
          seen,
          driveChanges: drive.filter((trip) => trip.count > 0),
        },
      });
    }
    if (path === '/api/invitations/read') {
      seen = route.request().postDataJSON().keys;
      return route.fulfill({ json: { ok: true } });
    }
    if (path === '/api/invitations/check-drive') {
      checks++;
      return route.fulfill({ json: { queued: 1 } });
    }
    return route.fulfill({
      json:
        path === '/api/me'
          ? {
              user: {
                id: 'owner',
                name: 'Александр Путешественник с очень длинным именем',
                username: 'owner',
                email: 'andrey.pleshakov@tallsagedev.ru',
                linkedEmails: [],
              },
              yandexEnabled: false,
            }
          : path === '/api/friends'
            ? lists
            : { accounts: [], groups: [], trips: [], expires: null },
    });
  });
  await page.goto('/people/friends');
  await expect.poll(() => polls).toBeGreaterThan(0);
  await expect.poll(() => checks).toBe(1);
  await expect(page.locator('.notification-dot')).toHaveCount(0);
  const before = polls;
  lists = { friends: [], incoming: [bob], outgoing: [alice] };
  await page.clock.fastForward(15001);
  await expect.poll(() => polls).toBeGreaterThan(before);
  await expect(page.locator('#friends .friend-requests').first()).toContainText(
    'Борис',
  );
  await expect(page.locator('.notification-dot')).toBeVisible();
  const bell = page.getByRole('button', { name: /Уведомления/ });
  const about = page
    .locator('.social-nav')
    .getByRole('link', { name: 'О проекте' });
  const [aboutBounds, bellBounds] = await Promise.all([
    about.boundingBox(),
    bell.boundingBox(),
  ]);
  expect(aboutBounds!.y).toBeGreaterThanOrEqual(
    bellBounds!.y + bellBounds!.height,
  );
  await bell.click();
  const inbox = page.getByRole('region', { name: 'Уведомления', exact: true });
  await expect(inbox).toContainText('Борис хочет добавить вас в друзья');
  await expect(page.locator('.notification-dot')).toHaveCount(0);
  await page.keyboard.press('Escape');
  lists = { friends: [alice], incoming: [], outgoing: [] };
  accepted = [alice];
  drive = [
    {
      id: 'frame',
      title: 'Новые воспоминания',
      count: 1,
      newest: 7,
      stamp: 'new-photo',
    },
  ];
  await page.clock.fastForward(15001);
  await expect(page.locator('#friends > .friends-list')).toContainText('Алиса');
  await expect(page.getByText('Вы друзья', { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Удалить из друзей' }),
  ).toBeVisible();
  await expect(page.locator('.notification-dot')).toBeVisible();
  await bell.click();
  await expect(inbox).toContainText('Заявка в друзья принята: Алиса');
  await expect(inbox).toContainText('С Яндекс Диска загружены новые кадры');
  await expect(
    inbox.getByRole('link', { name: 'Открыть поездку' }),
  ).toHaveAttribute('href', '/?trip=frame');
  await expect(
    inbox.getByRole('button', { name: 'Обновить поездку' }),
  ).toBeVisible();
  expect(checks).toBe(1);
  expect(new URL(page.url()).pathname).toBe('/people/friends');
  const controls = await Promise.all([
    page.locator('#find-people input').boundingBox(),
    page.getByRole('button', { name: 'Сгенерировать ссылку' }).boundingBox(),
  ]);
  expect(Math.abs(controls[0]!.y - controls[1]!.y)).toBeLessThan(2);
  expect(Math.abs(controls[0]!.height - controls[1]!.height)).toBeLessThan(2);
  await page.screenshot({ path: 'data/live-social-friends.png' });
});

for (const width of [393, 701, 800, 1024, 1280, 1440, 1920])
  test(
    'signed-in guest keeps profile and logout at ' + width,
    async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.route('**/api/**', (route) => {
        const path = new URL(route.request().url()).pathname;
        return route.fulfill({
          json:
            path === '/api/me'
              ? {
                  user: { id: 'owner', name: 'Owner', username: 'owner' },
                  yandexEnabled: false,
                }
              : path.startsWith('/api/share/')
                ? {
                    trip: {
                      id: 'frame',
                      title: 'Trip',
                      destination: 'Istanbul',
                      start: '2026-10-10',
                      end: '2026-10-18',
                      from: '2026-10-10',
                      to: '2026-10-18',
                      role: 'guest',
                    },
                    media: [],
                    places: [],
                    notes: [],
                  }
                : {
                    invitations: [],
                    count: 0,
                    friends: { friends: [], incoming: [], outgoing: [] },
                    drive: [],
                    trips: [],
                  },
        });
      });
      await page.goto('/s/fixture');
      const header = page.locator('header.site-header');
      await expect(
        header.getByRole('link', { name: 'Мой профиль' }),
      ).toBeVisible();
      await expect(header.locator('.header-guest-badge')).toBeVisible();
      await expect(
        header.getByRole('button', { name: /Уведомления/ }),
      ).toBeVisible();
      if (width < 700) {
        await header.getByRole('button', { name: 'Меню', exact: true }).click();
        await expect(
          page
            .getByRole('region', { name: 'Меню', exact: true })
            .getByRole('button', { name: 'Выйти' }),
        ).toBeVisible();
      } else
        await expect(
          header.getByRole('button', { name: 'Выйти', exact: true }),
        ).toBeVisible();
      if (width >= 701 && width < 1100) {
        const brand = (await header.locator('.header-brand').boundingBox())!;
        const badge = (await header
          .locator('.header-guest-badge')
          .boundingBox())!;
        const friends = (await header
          .getByRole('link', { name: 'Друзья', exact: true })
          .boundingBox())!;
        expect(badge.y).toBeGreaterThanOrEqual(brand.y + brand.height);
        expect(friends.height).toBeLessThanOrEqual(52);
      } else if (width >= 1600) {
        const caption = (await header.locator('.top-caption').boundingBox())!;
        const badge = (await header
          .locator('.header-guest-badge')
          .boundingBox())!;
        const actions = (await header.locator('.top-actions').boundingBox())!;
        expect(caption.y + caption.height).toBeLessThanOrEqual(badge.y);
        expect(caption.x + caption.width).toBeLessThanOrEqual(actions.x);
      } else if (width >= 1280) {
        await expect(header.locator('.top-caption')).toBeHidden();
        const badge = (await header
          .locator('.header-guest-badge')
          .boundingBox())!;
        const bell = (await header
          .getByRole('button', { name: /Уведомления/ })
          .boundingBox())!;
        expect(badge.x + badge.width).toBeLessThanOrEqual(bell.x);
        expect(badge.y).toBeLessThan(bell.y + bell.height);
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      await page.screenshot({ path: 'data/guest-header-' + width + '.png' });
    },
  );
