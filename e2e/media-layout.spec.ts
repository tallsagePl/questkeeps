import { test, expect } from '@playwright/test';
import sharp from 'sharp';

for (const width of [393, 1024, 1440]) {
  test(
    'full-screen media has one toolbar row and a contained edge-to-edge frame at ' +
      width,
    async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      const landscape = await sharp({
        create: {
          width: 1600,
          height: 900,
          channels: 3,
          background: '#597480',
        },
      })
        .jpeg()
        .toBuffer();
      const portrait = await sharp({
        create: {
          width: 900,
          height: 1600,
          channels: 3,
          background: '#547567',
        },
      })
        .jpeg()
        .toBuffer();
      const title =
        'Очень длинное название фотографии из нашего путешествия по Стамбулу и Анталье';
      const media = ['landscape', 'portrait'].map((id) => ({
        id,
        name: id + '.jpg',
        title,
        kind: 'photo',
        mime: 'image/jpeg',
        user_id: 'owner',
        author: 'Fixture',
        taken: '2026-10-11',
        hidden: 0,
        revision: '1',
        rotation: 0,
        lat: null,
        lon: null,
      }));
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route('**/api/**', (route) => {
        const path = new URL(route.request().url()).pathname;
        if (
          route.request().method() === 'PATCH' &&
          path.startsWith('/api/media/')
        ) {
          const item = media.find((item) => path === '/api/media/' + item.id)!;
          Object.assign(item, route.request().postDataJSON());
          return route.fulfill({ json: { ok: true } });
        }
        if (
          route.request().method() === 'DELETE' &&
          path.startsWith('/api/media/')
        ) {
          media.splice(
            media.findIndex((item) => path === '/api/media/' + item.id),
            1,
          );
          return route.fulfill({ json: { ok: true } });
        }
        if (path.endsWith('/preview') || path.endsWith('/original'))
          return route.fulfill({
            body: path.includes('/portrait/') ? portrait : landscape,
            contentType: 'image/jpeg',
          });
        const json =
          path === '/api/me'
            ? { user: { id: 'owner', name: 'Fixture' }, yandexEnabled: false }
            : path === '/api/trips/frame'
              ? {
                  trip: {
                    id: 'frame',
                    title: 'Frame',
                    destination: '',
                    start: '2026-10-10',
                    end: '2026-10-18',
                    from: '2026-10-10',
                    to: '2026-10-18',
                    role: 'owner',
                  },
                  media,
                  places: [],
                  notes: [],
                }
              : {
                  trips: [],
                  invitations: [],
                  count: 0,
                  friends: [],
                  incoming: [],
                  outgoing: [],
                  suggestions: [],
                };
        return route.fulfill({ json });
      });
      await page.goto('/?trip=frame');
      for (const id of ['landscape', 'portrait']) {
        await page
          .locator(
            '[data-media-index="' +
              (id === 'landscape' ? 0 : 1) +
              '"] .photo-card',
          )
          .click();
        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();
        await expect(dialog).toHaveCSS('opacity', '1');
        const box = (await dialog.boundingBox())!;
        expect(box.x).toBe(0);
        expect(box.y).toBe(0);
        expect(box.width).toBe(width);
        expect(box.height).toBe(900);
        const pencil = dialog.getByRole('button', {
          name: 'Изменить название',
          exact: true,
        });
        const reload = dialog.getByRole('button', {
          name: 'Перезагрузить фото или видео',
          exact: true,
        });
        const close = dialog.getByRole('button', {
          name: 'Закрыть',
          exact: true,
        });
        const controls = await Promise.all([
          dialog
            .getByRole('button', {
              name: 'Повернуть на 90° влево',
              exact: true,
            })
            .boundingBox(),
          dialog
            .getByRole('button', {
              name: 'Повернуть на 90° вправо',
              exact: true,
            })
            .boundingBox(),
          pencil.boundingBox(),
          reload.boundingBox(),
          close.boundingBox(),
        ]);
        expect(
          Math.max(...controls.map((b) => b!.y)) -
            Math.min(...controls.map((b) => b!.y)),
        ).toBeLessThan(2);
        for (const control of controls) {
          expect(control!.width).toBeGreaterThanOrEqual(44);
          expect(control!.height).toBeGreaterThanOrEqual(44);
        }
        await expect(dialog.locator('.viewer-original')).toHaveAttribute(
          'data-state',
          'loaded',
        );
        const stage = (await dialog
          .locator('.photo-viewer-image')
          .boundingBox())!;
        expect(stage.x).toBe(0);
        expect(stage.width).toBe(width);
        expect(stage.height).toBeGreaterThan(800);
        expect(
          await dialog
            .locator('.viewer-original')
            .evaluate((el) => getComputedStyle(el).objectFit),
        ).toBe('contain');
        await page.screenshot({
          path: 'data/viewer-' + width + '-' + id + '.png',
        });
        await pencil.click();
        await expect(dialog.getByLabel('Название кадра')).toBeVisible();
        await dialog
          .getByRole('button', { name: 'Отмена', exact: true })
          .click();
        await close.click();
        await expect(dialog).toHaveCount(0);
      }
      await page.locator('[data-media-index="0"] .photo-card').click();
      const viewer = page.getByRole('dialog');
      await viewer
        .getByRole('button', { name: 'Повернуть на 90° вправо', exact: true })
        .click();
      await expect(viewer.locator('.rotation-frame')).toHaveAttribute(
        'data-rotation',
        '90',
      );
      const rotated = await viewer
        .locator('.rotation-frame-content')
        .boundingBox();
      expect(rotated!.width).toBeLessThanOrEqual(width + 1);
      expect(rotated!.x).toBeGreaterThanOrEqual(-1);
      await viewer
        .getByRole('button', { name: 'Повернуть на 90° влево', exact: true })
        .click();
      await expect(viewer.locator('.rotation-frame')).toHaveAttribute(
        'data-rotation',
        '0',
      );
      await page.keyboard.press('ArrowRight');
      await expect(viewer.locator('.viewer-original')).toHaveAttribute(
        'src',
        /portrait/,
      );
      await viewer
        .getByRole('button', { name: 'Предыдущий кадр', exact: true })
        .click();
      await expect(viewer.locator('.viewer-original')).toHaveAttribute(
        'src',
        /landscape/,
      );
      await viewer
        .getByRole('button', { name: 'Повернуть на 90° вправо', exact: true })
        .click();
      await expect(viewer.locator('.rotation-frame')).toHaveAttribute(
        'data-rotation',
        '90',
      );
      await viewer
        .getByRole('button', { name: 'Закрыть', exact: true })
        .click();
      await page.reload();
      await page.locator('[data-media-index="0"] .photo-card').click();
      await expect(
        viewer.locator('.photo-viewer-image .rotation-frame'),
      ).toHaveAttribute('data-rotation', '90');
      await viewer
        .getByRole('button', {
          name: 'Удалить фотографию из архива',
          exact: true,
        })
        .click();
      await expect(
        viewer.getByText('Оригинал останется на Яндекс Диске.', {
          exact: false,
        }),
      ).toBeVisible();
      await viewer
        .getByRole('button', { name: 'Удалить из архива?', exact: true })
        .click();
      await expect(viewer).toHaveCount(0);
      await expect(page.locator('.photo-card')).toHaveCount(1);
      expect(errors).toEqual([]);
    },
  );
}
