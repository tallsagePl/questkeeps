import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import type { TripCoverSettings } from '../lib/contracts';

test.use({ hasTouch: true });

for (const width of [393, 1440])
  test(
    'cover modes, framing, five-photo limit and footer at ' + width,
    async ({ page }) => {
      await page.setViewportSize({ width, height: width < 700 ? 852 : 1000 });
      const photo = fs.readFileSync('public/welcome/santorini.webp');
      let settings: TripCoverSettings = {
        mode: 'all',
        photoIds: [],
        positions: {},
      };
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
        media_count: 7,
      };
      await page.route('**/api/**', (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path.endsWith('/preview'))
          return route.fulfill({ body: photo, contentType: 'image/webp' });
        if (path === '/api/trips/frame/cover') {
          if (route.request().method() === 'PATCH')
            settings = route.request().postDataJSON();
          return route.fulfill({ json: settings });
        }
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
                    media: Array.from({ length: 7 }, (_, i) => ({
                      id: 'photo' + i,
                      name: 'Фото ' + i,
                      kind: 'photo',
                      mime: 'image/jpeg',
                      favorite: i < 6,
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
                : path === '/api/trips'
                  ? {
                      trips: [
                        {
                          ...trip,
                          covers:
                            settings.mode === 'selected'
                              ? settings.photoIds.map((id) => ({
                                  id,
                                  src: '/api/media/' + id + '/preview',
                                  position: settings.positions?.[id],
                                }))
                              : [],
                        },
                      ],
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
      const all = panel.getByRole('radio', {
        name: 'Все избранные',
        exact: true,
      });
      await expect(all).toBeChecked();
      await expect(panel.getByRole('checkbox')).toHaveCount(0);
      const tile = (i: number) =>
        panel.getByRole('button', {
          name: 'Настроить кадрирование: Фото ' + i,
          exact: true,
        });
      const dialog = page.getByRole('dialog', { name: 'Кадрирование обложки' });
      const open = async (i: number) => {
        await tile(i).click();
        await expect(
          dialog.getByRole('button', { name: 'Применить кадрирование' }),
        ).toBeEnabled();
      };
      await open(0);
      await dialog
        .getByRole('button', { name: 'Закрыть', exact: true })
        .click();
      await expect(all).toBeChecked();
      await expect(tile(0)).toHaveAttribute('aria-pressed', 'false');
      await open(0);
      const vertical = dialog.getByRole('slider', { name: 'По вертикали' });
      await expect(vertical).toBeEnabled();
      await vertical.focus();
      await vertical.press('End');
      await expect(vertical).toHaveValue('100');
      expect(
        (
          await new AxeBuilder({ page })
            .include('dialog')
            .withTags(['wcag2a', 'wcag2aa'])
            .analyze()
        ).violations,
      ).toEqual([]);
      expect(
        await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBeTruthy();
      const crop = (await dialog.locator('.cover-crop-preview').boundingBox())!;
      const measured = (await page
        .locator('.cover-size-probe .trip-art')
        .boundingBox())!;
      expect(
        Math.abs(crop.width / crop.height - measured.width / measured.height),
      ).toBeLessThan(0.03);
      await page.screenshot({ path: 'data/cover-crop-' + width + '.png' });
      await dialog
        .getByRole('button', { name: 'Применить кадрирование' })
        .click();
      await expect(all).not.toBeChecked();
      await expect(
        panel.getByRole('radio', { name: 'Выбранные фото', exact: true }),
      ).toBeChecked();
      await expect(tile(0)).toHaveAttribute('aria-pressed', 'true');
      await open(2);
      await dialog
        .getByRole('button', { name: 'Применить кадрирование' })
        .click();
      await panel.getByRole('button', { name: 'Сохранить обложку' }).click();
      await expect.poll(() => settings.photoIds).toEqual(['photo0', 'photo2']);
      expect(settings.positions?.photo0.y).toBe(100);
      await page.reload();
      await expect(tile(0)).toHaveAttribute('aria-pressed', 'true');
      await expect(
        panel.locator('.media-preview[data-state="loaded"]'),
      ).toHaveCount(6);
      await panel.scrollIntoViewIfNeeded();
      await expect(panel.locator('.media-preview img').first()).toHaveCSS(
        'opacity',
        '1',
      );
      await expect(panel.locator('.photo-placeholder').first()).toHaveCSS(
        'opacity',
        '0',
      );
      await page.screenshot({
        path: 'data/cover-picker-ready-' + width + '.png',
        fullPage: true,
      });
      await open(0);
      await expect(vertical).toHaveValue('100');
      const beforeScroll = await page.evaluate(() => window.scrollY);
      const target = dialog.locator('.cover-photo-frame');
      const box = (await target.boundingBox())!;
      if (width < 700) {
        const cdp = await page.context().newCDPSession(page);
        const x = Math.round(box.x + box.width / 2);
        const y = Math.round(box.y + box.height / 2);
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [{ x, y }],
        });
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x, y: y + 30 }],
        });
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchEnd',
          touchPoints: [],
        });
        await cdp.detach();
      } else {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(
          box.x + box.width / 2,
          box.y + box.height / 2 + 30,
          { steps: 4 },
        );
        await page.mouse.up();
      }
      await expect(vertical).not.toHaveValue('100');
      expect(await page.evaluate(() => window.scrollY)).toBe(beforeScroll);
      await dialog
        .getByRole('button', { name: 'Применить кадрирование' })
        .click();
      for (const i of [1, 3, 4]) {
        await open(i);
        await dialog
          .getByRole('button', { name: 'Применить кадрирование' })
          .click();
      }
      await expect(tile(5)).toBeDisabled();
      await expect(
        panel.getByText('Выбрано 5 из 5', { exact: true }),
      ).toBeVisible();
      await open(0);
      await dialog.getByRole('button', { name: 'Убрать из обложки' }).click();
      await expect(tile(5)).toBeEnabled();
      await expect(tile(0)).toHaveAttribute('aria-pressed', 'false');
      await expect(
        panel.getByRole('button', {
          name: 'Настроить кадрирование: Фото 6',
          exact: true,
        }),
      ).toHaveCount(0);
      expect(
        (
          await new AxeBuilder({ page })
            .include('.cover-settings')
            .withTags(['wcag2a', 'wcag2aa'])
            .analyze()
        ).violations,
      ).toEqual([]);
      await all.check();
      await expect(tile(2)).toHaveAttribute('aria-pressed', 'false');
      await panel.getByRole('button', { name: 'Сохранить обложку' }).click();
      await expect.poll(() => settings.mode).toBe('all');
      await page.evaluate(() =>
        window.scrollTo(0, document.documentElement.scrollHeight),
      );
      const top = page.getByRole('button', { name: 'Наверх', exact: true });
      await expect(top).toBeVisible();
      const button = (await top.boundingBox())!;
      for (const child of await page.locator('footer.site-footer > *').all()) {
        const b = (await child.boundingBox())!;
        expect(
          Math.min(b.x + b.width, button.x + button.width) <=
            Math.max(b.x, button.x) ||
            Math.min(b.y + b.height, button.y + button.height) <=
              Math.max(b.y, button.y),
        ).toBeTruthy();
      }
    },
  );
