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
