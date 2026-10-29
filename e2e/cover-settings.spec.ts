import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import AxeBuilder from '@axe-core/playwright';

for (const width of [393, 1440])
  test(
    'trip management order and persistent cover selection at ' + width,
    async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      const photo = fs.readFileSync('public/welcome/santorini.webp');
      let settings = { mode: 'all', photoIds: [] as string[] };
      const requests: unknown[] = [];
      await page.route('**/api/**', (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path.endsWith('/preview'))
          return route.fulfill({ body: photo, contentType: 'image/webp' });
        if (path === '/api/trips/frame/cover') {
          if (route.request().method() === 'PATCH') {
            settings = route.request().postDataJSON();
            requests.push(settings);
          }
          return route.fulfill({ json: settings });
        }
        const trip = {
          id: 'frame',
          title: 'Наша поездка',
          destination: 'Стамбул',
          start: '2026-10-10',
          end: '2026-10-18',
          from: '2026-10-10',
          to: '2026-10-18',
          role: 'owner',
          sharing: false,
          media_count: 4,
        };
        return route.fulfill({
          json:
            path === '/api/me'
              ? {
                  user: { id: 'owner', name: 'Fixture', username: 'fixture' },
                  yandexEnabled: true,
                }
              : path === '/api/trips/frame'
                ? {
                    trip,
                    media: Array.from({ length: 4 }, (_, i) => ({
                      id: 'photo' + i,
                      name: 'Фото ' + i,
                      kind: 'photo',
                      mime: 'image/jpeg',
                      favorite: i < 3,
                      hidden: 0,
                      revision: '1',
                      user_id: 'owner',
                      author: 'Fixture',
                      taken: '2026-10-12',
                      lat: null,
                      lon: null,
                    })),
                    places: [],
                    notes: [],
                  }
                : path.endsWith('/members')
                  ? {
                      members: [],
                      owner: {
                        id: 'owner',
                        name: 'Fixture',
                        username: 'fixture',
                      },
                    }
                  : {
                      trips: [],
                      accounts: [],
                      sources: [],
                      friends: [],
                      incoming: [],
                      outgoing: [],
                      count: 0,
                      invitations: [],
                      drive: [],
                    },
        });
      });
      await page.goto('/?trip=frame#view=settings');
      const panel = page.locator('.cover-settings');
      await expect(
        page.getByRole('button', { name: 'Управление поездкой', exact: true }),
      ).toBeVisible();
      await expect(
        page.locator(
          '.trip-management > section > h2, .trip-management > section .panel-title h2, .trip-management > section.share-panel h2',
        ),
      ).toHaveText([
        'Участники',
        'Гостевой просмотр',
        'Оформление поездки',
        'Подключённые диски',
      ]);
      const all = panel.getByLabel('Все избранные', { exact: true });
      await expect(all).toBeChecked();
      await expect(
        panel.getByRole('checkbox', { name: 'Фото 0', exact: true }),
      ).toBeDisabled();
      await all.uncheck();
      await expect(
        panel.getByRole('button', { name: 'Сохранить обложку' }),
      ).toBeDisabled();
      await panel
        .getByRole('checkbox', { name: 'Фото 0', exact: true })
        .check();
      await panel
        .getByRole('checkbox', { name: 'Фото 2', exact: true })
        .check();
      await expect(
        panel.getByRole('checkbox', { name: 'Фото 3', exact: true }),
      ).toHaveCount(0);
      await panel.getByRole('button', { name: 'Сохранить обложку' }).click();
      await expect(
        panel.getByRole('button', { name: 'Сохранить обложку' }),
      ).toBeDisabled();
      await expect
        .poll(() => settings)
        .toEqual({
          mode: 'selected',
          photoIds: ['photo0', 'photo2'],
        });
      await page.reload();
      await expect(
        panel.getByRole('checkbox', { name: 'Фото 0', exact: true }),
      ).toBeChecked();
      await expect(
        panel.getByRole('checkbox', { name: 'Фото 2', exact: true }),
      ).toBeChecked();
      await expect(all).not.toBeChecked();
      await panel.scrollIntoViewIfNeeded();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      const violations = (
        await new AxeBuilder({ page })
          .include('.cover-settings')
          .withTags(['wcag2a', 'wcag2aa'])
          .analyze()
      ).violations;
      expect(violations).toEqual([]);
      await expect(
        panel.locator('.media-preview[data-state="loaded"]'),
      ).toHaveCount(3);
      for (const image of await panel
        .locator('.cover-option-image img')
        .all()) {
        const frame = (await image.locator('..').locator('..').boundingBox())!;
        const bounds = (await image.boundingBox())!;
        expect(bounds.width).toBeLessThanOrEqual(frame.width + 1);
        expect(bounds.height).toBeLessThanOrEqual(frame.height + 1);
        expect(bounds.y).toBeGreaterThanOrEqual(frame.y - 1);
      }
      await page.screenshot({
        path: 'data/trip-management-' + width + '.png',
        fullPage: true,
      });
      await all.check();
      await expect(
        panel.getByRole('checkbox', { name: 'Фото 0', exact: true }),
      ).toBeDisabled();
      await panel.getByRole('button', { name: 'Сохранить обложку' }).click();
      await expect.poll(() => settings.mode).toBe('all');
      expect(requests).toHaveLength(2);
      await page.evaluate(() =>
        window.scrollTo(0, document.documentElement.scrollHeight),
      );
      const top = page.getByRole('button', { name: 'Наверх', exact: true });
      await expect(top).toBeVisible();
      const button = (await top.boundingBox())!;
      for (const child of await page.locator('footer.site-footer > *').all()) {
        const bounds = (await child.boundingBox())!;
        const overlapX =
          Math.min(bounds.x + bounds.width, button.x + button.width) -
          Math.max(bounds.x, button.x);
        const overlapY =
          Math.min(bounds.y + bounds.height, button.y + button.height) -
          Math.max(bounds.y, button.y);
        expect(overlapX <= 0 || overlapY <= 0).toBeTruthy();
      }
      await page.screenshot({ path: 'data/trip-footer-' + width + '.png' });
    },
  );
