import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const screens = [
  { name: 'iphone', width: 393, height: 852, touch: true, columns: 2 },
  { name: 'ipad', width: 1024, height: 1366, touch: true, columns: 3 },
  { name: 'laptop', width: 1440, height: 900, touch: false, columns: 4 },
];

for (const screen of screens) {
  test.describe(screen.name, () => {
    test.use({
      viewport: { width: screen.width, height: screen.height },
      hasTouch: screen.touch,
      reducedMotion: 'reduce',
    });
    test('archive, long feeds, settings and profile fit the viewport', async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => {
        errors.push(e.message);
      });
      const photo = fs.readFileSync('public/welcome/santorini.webp');
      const trip = {
        id: 'responsive',
        title: 'Стамбул: путешествие с друзьями',
        destination: 'Анталья → Стамбул || Турция',
        description:
          'Фотографии, прогулки по городу и места, которые хочется сохранить.',
        start: '2026-10-10',
        end: '2026-10-18',
        from: '2026-10-10',
        to: '2026-10-18',
        role: 'owner',
        sharing: false,
        media_count: 240,
      };
      const user = {
        id: 'owner',
        name: 'Александр Путешественник',
        username: 'traveller',
        email: 'traveller@example.invalid',
        linkedEmails: [],
      };
      const media = Array.from({ length: 240 }, (_, i) => ({
        id: 'photo' + i,
        name: 'Стамбул ' + i + '.jpg',
        kind: 'photo',
        mime: 'image/jpeg',
        taken: '2026-10-11',
        author: user.name,
        user_id: 'owner',
        lat: i === 0 ? 41.01 : null,
        lon: i === 0 ? 28.98 : null,
        hidden: 0,
        revision: '1',
      }));
      const places = Array.from({ length: 60 }, (_, i) => ({
        id: 'place' + i,
        media_id: 'photo0',
        title:
          (i % 3 === 0
            ? 'Цистерна Базилика — древнее водохранилище в центре Стамбула'
            : 'Улицы старого города') +
          ' ' +
          i,
        summary:
          'Историческое место, архитектура и прогулки по уютным улицам города.',
        url: 'https://ru.wikipedia.org/?curid=' + (i + 1),
        day: '2026-10-11',
      }));
      await page.route('https://services.arcgisonline.com/**', (r) =>
        r.fulfill({ body: photo, contentType: 'image/webp' }),
      );
      await page.route('https://tile.openstreetmap.org/**', (r) =>
        r.fulfill({ body: photo, contentType: 'image/webp' }),
      );
      await page.route('**/api/**', (r) => {
        const path = new URL(r.request().url()).pathname;
        if (path.endsWith('/preview') || path.endsWith('/original'))
          return r.fulfill({ body: photo, contentType: 'image/webp' });
        let json: unknown = {};
        if (path === '/api/me') json = { user, yandexEnabled: true };
        else if (path === '/api/trips')
          json = {
            trips: [
              trip,
              {
                ...trip,
                id: 'other',
                title: 'Небольшое путешествие на выходные',
              },
            ],
          };
        else if (path === '/api/trips/responsive')
          json = {
            trip,
            media,
            places,
            notes: [],
            importStatus: { sourceCount: 1 },
          };
        else if (path === '/api/accounts') json = { accounts: [] };
        else if (path === '/api/friends')
          json = { friends: [], incoming: [], outgoing: [] };
        else if (path === '/api/invitations')
          json = { invitations: [], count: 0 };
        else if (path === '/api/follows') json = { trips: [] };
        else if (path === '/api/my-media/groups')
          json = { groups: [{ id: trip.id, title: trip.title, count: 240 }] };
        else if (path.endsWith('/members'))
          json = {
            owner: { ...user, hasAvatar: false },
            members: [
              {
                id: 'member',
                user_id: 'member',
                name: 'Очень длинное имя участника путешествия',
                username: 'member',
                hasAvatar: false,
                start: trip.start,
                end: trip.end,
                all_photos: 1,
                active: 1,
              },
            ],
          };
        else if (path.endsWith('/sources')) json = { sources: [] };
        else if (path.endsWith('/image'))
          json = { image: '/welcome/santorini.webp' };
        else if (path.endsWith('/text') || path.includes('/places/description'))
          json = {
            description:
              'Историческое место, архитектура и прогулки по уютным улицам города.',
            summary:
              'Историческое место, архитектура и прогулки по уютным улицам города.',
          };
        else if (path.endsWith('/places'))
          json = {
            suggestions: [
              { pageid: 801, title: 'Цистерна Базилика', dist: 40 },
              { pageid: 802, title: 'Голубая мечеть', dist: 80 },
              { pageid: 803, title: 'Дворец Топкапы', dist: 100 },
            ],
          };
        return r.fulfill({ json });
      });
      const fit = async () =>
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
      const capture = async (name: string) => {
        await fit();
        await page.screenshot({
          path:
            'data/responsive-' +
            (process.env.RESPONSIVE_BASELINE ? 'before-' : 'after-') +
            screen.name +
            '-' +
            name +
            '.png',
        });
      };
      await page.goto('/?trip=responsive');
      await page.locator('.photo-card').first().waitFor();
      await expect(
        page.locator('.photo-card .media-preview[data-state=loaded]').first(),
      ).toBeVisible();
      await capture('header');
      const grid = page.locator('.virtual-gallery');
      await grid.evaluate((el) =>
        window.scrollTo({
          top: scrollY + el.getBoundingClientRect().top,
          behavior: 'instant',
        }),
      );
      await page.waitForTimeout(200);
      const metrics = await grid.evaluate((el) => ({
        columns: getComputedStyle(el).gridTemplateColumns.split(' ').length,
        width: el.getBoundingClientRect().width,
        card: el.querySelector('.photo-card')!.getBoundingClientRect().height,
      }));
      expect(metrics.columns).toBe(screen.columns);
      expect(metrics.card).toBeGreaterThan(160);
      expect(metrics.card).toBeLessThan(270);
      await capture('gallery');
      for (let i = 0; i < 5; i++) {
        await page.evaluate(() =>
          window.scrollBy({ top: 500, behavior: 'instant' }),
        );
        await page.waitForTimeout(80);
      }
      await expect.poll(() => grid.getAttribute('data-base-row')).not.toBe('0');
      const anchor = await grid
        .locator('[data-media-index]:not([hidden])')
        .evaluateAll((nodes) => {
          const visible = nodes.filter(
            (n) =>
              n.getBoundingClientRect().bottom > 80 &&
              n.getBoundingClientRect().top < innerHeight,
          );
          return Number(visible[0].getAttribute('data-media-index'));
        });
      await page.setViewportSize({
        width: screen.width === 393 ? 1024 : 393,
        height: screen.height,
      });
      await expect
        .poll(() =>
          grid
            .locator('[data-media-index="' + anchor + '"]')
            .evaluateAll((nodes) =>
              nodes.some((n) => {
                const r = n.getBoundingClientRect();
                return r.top < innerHeight && r.bottom > 0;
              }),
            ),
        )
        .toBe(true);
      await page.setViewportSize({
        width: screen.width,
        height: screen.height,
      });

      await fit();
      await page
        .getByRole('button', { name: 'Открытые места', exact: true })
        .click();
      const feed = page.locator('.virtual-places');
      await feed.locator('article').first().waitFor();
      await page.locator('.place-recommendations').scrollIntoViewIfNeeded();
      await page.locator('.place-recommendation').first().waitFor();
      await expect(
        page
          .locator('.place-recommendation .media-preview[data-state=loaded]')
          .first(),
      ).toBeVisible();
      expect(
        (await page.locator('.place-recommendation').first().boundingBox())!
          .width,
      ).toBeGreaterThan(230);
      await capture('suggestions');
      await feed.evaluate((el) =>
        window.scrollTo({
          top: scrollY + el.getBoundingClientRect().top,
          behavior: 'instant',
        }),
      );
      await page.waitForTimeout(250);
      await capture('places');
      expect(
        await feed
          .locator('article')
          .first()
          .evaluate((el) => el.getBoundingClientRect().height),
      ).toBeLessThan(400);
      await expect
        .poll(() =>
          feed.locator('article').evaluateAll((nodes) =>
            nodes.some((n) => {
              const r = n.getBoundingClientRect();
              return r.top < innerHeight && r.bottom > 0;
            }),
          ),
        )
        .toBe(true);
      for (let i = 0; i < 5; i++) {
        await page.mouse.wheel(0, 500);
        await page.waitForTimeout(80);
      }
      await expect.poll(() => feed.getAttribute('data-base-row')).not.toBe('0');
      await page.getByRole('button', { name: 'Карта', exact: true }).click();
      await page.locator('.leaflet-container').first().waitFor();
      await capture('map');
      await page.getByRole('button', { name: 'Дневник', exact: true }).click();
      await page.locator('.notes-layout').waitFor();
      await capture('journal');
      await page
        .getByRole('button', { name: 'Участники и Диски', exact: true })
        .click();
      await page.locator('.member').last().waitFor();
      await capture('settings');
      await page
        .getByRole('button', { name: 'Пригласить участника', exact: true })
        .click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await capture('invite');
      await page
        .getByRole('dialog')
        .getByRole('button', { name: 'Закрыть', exact: true })
        .click();
      await page.goto('/profile');
      await page.locator('.profile-settings').waitFor();
      await capture('profile');
      await page.locator('.appearance-button').first().click();
      await page.locator('.theme-button').click();
      await capture('profile-en-dark');
      await page.goto('/');
      await page.locator('.trip-card').first().waitFor();
      await capture('dashboard');
      await page.goto('/about');
      await page.locator('main').waitFor();
      await capture('about');
      expect(errors).toEqual([]);
    });
  });
}
