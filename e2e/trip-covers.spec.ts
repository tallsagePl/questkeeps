import { test, expect } from '@playwright/test';
import fs from 'node:fs';

for (const width of [393, 1440])
  test(
    'favorite trip covers and followed artwork fit ' + width,
    async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.addInitScript(() => {
        Math.random = () => 0;
      });
      const image = fs.readFileSync('public/welcome/santorini.webp');
      await page.route('**/api/**', (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path.includes('/preview'))
          return route.fulfill({ body: image, contentType: 'image/webp' });
        const trip = {
          id: 'own',
          title: 'Летние воспоминания',
          destination: 'Санторини, Греция',
          start: '2026-10-10',
          end: '2026-10-18',
          media_count: 10,
        };
        return route.fulfill({
          json:
            path === '/api/me'
              ? {
                  user: { id: 'owner', name: 'Fixture', username: 'fixture' },
                  yandexEnabled: true,
                }
              : path === '/api/trips'
                ? {
                    trips: [
                      {
                        ...trip,
                        covers: [
                          { id: 'a', src: '/api/media/a/preview' },
                          {
                            id: 'b',
                            src: '/api/media/b/preview',
                            rotation: 90,
                          },
                        ],
                      },
                    ],
                  }
                : path === '/api/follows'
                  ? {
                      trips: [
                        {
                          ...trip,
                          id: 'followed',
                          title: 'Поездка друга',
                          url: '/s/fixture',
                          covers: [],
                        },
                      ],
                    }
                  : {
                      invitations: [],
                      count: 0,
                      friends: [],
                      incoming: [],
                      outgoing: [],
                      trips: [],
                      drive: [],
                    },
        });
      });
      await page.goto('/');
      const own = page.locator('button.trip-card');
      await own.scrollIntoViewIfNeeded();
      await expect(own.locator('.trip-cover-current img')).toBeVisible();
      const initial = await own
        .locator('.trip-cover-current img')
        .getAttribute('src');
      await expect(
        page.locator('.followed-card .trip-art:not(.has-cover)'),
      ).toBeVisible();
      await expect(page.locator('.followed-card .destination-art')).toHaveText(
        'Санторини, Греция',
      );
      await own.scrollIntoViewIfNeeded();
      await expect(own.locator('.trip-cover-current img')).not.toHaveAttribute(
        'src',
        initial!,
        { timeout: 12000 },
      );
      await expect(own.locator('.trip-cover-photo')).toHaveCount(2);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      await page.screenshot({
        path: 'data/favorite-covers-' + width + '.png',
        fullPage: true,
      });
    },
  );

test('reduced motion keeps one still cover', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const image = fs.readFileSync('public/welcome/santorini.webp');
  let previews = 0;
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.includes('/preview')) {
      previews++;
      return route.fulfill({ body: image, contentType: 'image/webp' });
    }
    return route.fulfill({
      json:
        path === '/api/me'
          ? { user: { id: 'owner', name: 'Fixture', username: 'fixture' } }
          : path === '/api/trips'
            ? {
                trips: [
                  {
                    id: 'own',
                    title: 'Trip',
                    destination: 'City',
                    start: '2026-10-10',
                    end: '2026-10-18',
                    media_count: 2,
                    covers: [
                      { id: 'a', src: '/api/media/a/preview' },
                      { id: 'b', src: '/api/media/b/preview' },
                    ],
                  },
                ],
              }
            : {
                trips: [],
                invitations: [],
                count: 0,
                friends: [],
                incoming: [],
                outgoing: [],
                drive: [],
              },
    });
  });
  await page.goto('/');
  await expect(page.locator('.trip-cover-current img')).toBeVisible();
  await page.clock.install();
  await page.clock.fastForward(16000);
  expect(previews).toBe(1);
  await expect(page.locator('.trip-cover-current')).toHaveCSS(
    'animation-name',
    'none',
  );
});

test('failed cover previews retain the archive illustration', async ({
  page,
}) => {
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.includes('/preview'))
      return route.fulfill({ status: 404, json: { error: 'Unavailable' } });
    return route.fulfill({
      json:
        path === '/api/me'
          ? { user: { id: 'owner', name: 'Fixture' } }
          : path === '/api/trips'
            ? {
                trips: [
                  {
                    id: 'own',
                    title: 'Trip',
                    destination: 'City',
                    start: '2026-10-10',
                    end: '2026-10-18',
                    media_count: 1,
                    covers: [{ id: 'bad', src: '/api/media/bad/preview' }],
                  },
                ],
              }
            : {
                trips: [],
                invitations: [],
                count: 0,
                friends: [],
                incoming: [],
                outgoing: [],
                drive: [],
              },
    });
  });
  await page.goto('/');
  const card = page.locator('button.trip-card');
  await expect(card.locator('.trip-art:not(.has-cover)')).toBeVisible();
  await expect(card.locator('.destination-art')).toHaveText('City');
  await expect(card.locator('.trip-cover-photo')).toHaveCount(0);
});

test('shared cover appears in member and followed cards and both trip views', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const image = fs.readFileSync('public/welcome/santorini.webp');
  const trip = {
    id: 'shared',
    title: 'Общая поездка',
    destination: 'Санторини, Греция',
    description: '',
    start: '2026-10-10',
    end: '2026-10-18',
    from: '2026-10-10',
    to: '2026-10-18',
    sharing: true,
    media_count: 1,
  };
  const cover = {
    id: 'shared-photo',
    src: '/api/media/shared-photo/preview?revision=shared',
    position: { x: 20, y: 75 },
    rotation: 90,
  };
  const guestCover = { ...cover, src: cover.src + '&share=fixture' };
  const previews = new Set<string>();
  let guest = false;
  await page.route('**/api/**', (route) => {
    const { pathname, search } = new URL(route.request().url());
    if (pathname.endsWith('/preview')) {
      previews.add(pathname + search);
      return route.fulfill({ body: image, contentType: 'image/webp' });
    }
    if (pathname === '/api/me')
      return route.fulfill({
        json: {
          user: guest
            ? null
            : { id: 'member', name: 'Fixture', username: 'member' },
        },
      });
    if (pathname === '/api/trips')
      return route.fulfill({ json: { trips: [{ ...trip, covers: [cover] }] } });
    if (pathname === '/api/follows')
      return route.fulfill({
        json: {
          trips: [
            {
              ...trip,
              title: 'Поездка из подписок',
              url: '/s/fixture',
              covers: [guestCover],
            },
          ],
        },
      });
    if (pathname === '/api/trips/shared' || pathname === '/api/share/fixture')
      return route.fulfill({
        json: {
          trip: {
            ...trip,
            role: guest ? 'guest' : 'member',
            covers: [guest ? guestCover : cover],
          },
          media: [],
          places: [],
          notes: [],
          noteReplies: [],
        },
      });
    return route.fulfill({
      json: {
        trips: [],
        invitations: [],
        friends: [],
        incoming: [],
        outgoing: [],
        drive: [],
        count: 0,
      },
    });
  });
  const expectCover = async (selector: string) => {
    const photo = page.locator(selector + ' .trip-cover-current img');
    await expect(photo).toBeVisible();
    await expect(photo).toHaveAttribute('style', /rotate\(90deg\)/);
  };
  await page.goto('/');
  await expectCover('button.trip-card');
  await expectCover('.followed-card');
  expect(previews).toEqual(new Set([cover.src, guestCover.src]));
  await page.locator('button.trip-card').click();
  await expectCover('.trip-heading-cover');
  guest = true;
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto('/s/fixture');
  await expectCover('.trip-heading-cover');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    393,
  );
});
