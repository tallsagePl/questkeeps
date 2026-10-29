import { test, expect } from '@playwright/test';

const alice = {
  id: 'alice',
  name: 'Алиса',
  username: 'alice',
  hasAvatar: false,
};

const bob = { id: 'bob', name: 'Борис', username: 'bob', hasAvatar: false };

test('friend changes and Drive imports update the profile and bell without reloading', async ({
  page,
}) => {
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
                name: 'Owner',
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
  await page.goto('/profile');
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
  expect(new URL(page.url()).pathname).toBe('/profile');
  const controls = await Promise.all([
    page.locator('#find-people input').boundingBox(),
    page.getByRole('button', { name: 'Сгенерировать ссылку' }).boundingBox(),
  ]);
  expect(Math.abs(controls[0]!.y - controls[1]!.y)).toBeLessThan(2);
  expect(Math.abs(controls[0]!.height - controls[1]!.height)).toBeLessThan(2);
  await expect(page.locator('.profile-email')).toHaveCSS(
    'white-space',
    'nowrap',
  );
  await page.screenshot({ path: 'data/live-social-profile.png' });
});

for (const width of [393, 1280, 1440])
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
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      await page.screenshot({ path: 'data/guest-header-' + width + '.png' });
    },
  );
