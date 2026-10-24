import { test, expect } from '@playwright/test';

for (const width of [320, 393, 1024, 1440]) {
  test(
    'header and non-modal invitations fit ' + width + 'px',
    async ({ page }) => {
      await page.setViewportSize({ width, height: width < 700 ? 852 : 1000 });
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route('**/api/**', (route) => {
        const path = new URL(route.request().url()).pathname;
        return route.fulfill({
          json:
            path === '/api/me'
              ? {
                  user: {
                    id: 'fixture',
                    name: 'Александр Путешественник',
                    username: 'traveller',
                    email: 'traveller@example.invalid',
                    linkedEmails: [],
                  },
                  yandexEnabled: true,
                }
              : path === '/api/invitations'
                ? {
                    invitations: [
                      {
                        id: 'invite',
                        title: 'Стамбул и прогулки по берегу Босфора',
                        sender: 'Матвей',
                        destination: 'Турция',
                        start: '2026-10-10',
                        end: '2026-10-18',
                        expires: Date.now() + 86400000,
                        all_photos: true,
                      },
                    ],
                    count: 1,
                  }
                : {
                    trips: [],
                    friends: [],
                    incoming: [],
                    outgoing: [],
                    accounts: [],
                    groups: [],
                  },
        });
      });
      await page.goto('/');
      await expect(
        page.getByRole('heading', { name: 'Ваши путешествия.' }),
      ).toBeVisible();
      const header = page.locator('header.site-header');
      if (width < 700) {
        expect((await header.boundingBox())!.height).toBe(64);
        const logo = await header.locator('.qk-brand').boundingBox();
        expect(Math.abs(logo!.x + logo!.width / 2 - width / 2)).toBeLessThan(2);
        await expect(
          header.getByRole('button', { name: 'Меню', exact: true }),
        ).toBeVisible();
        for (const control of [
          '.mobile-header-menu',
          '.invitation-notifications',
          '.user-button',
        ]) {
          const box = await header.locator(control).boundingBox();
          expect(box!.width).toBeGreaterThanOrEqual(44);
          expect(box!.height).toBeGreaterThanOrEqual(44);
        }
      }
      const bell = header.getByRole('button', {
        name: /Приглашения в поездки/,
      });
      await bell.click();
      const panel = page.getByRole('region', {
        name: 'Приглашения в поездки',
        exact: true,
      });
      await expect(
        panel.getByRole('heading', {
          name: 'Стамбул и прогулки по берегу Босфора',
        }),
      ).toBeVisible();
      await expect(bell).toHaveAttribute('aria-expanded', 'true');
      expect(
        await page.evaluate(() => document.querySelectorAll(':modal').length),
      ).toBe(0);
      expect(
        await page.evaluate(() => getComputedStyle(document.body).overflow),
      ).not.toBe('hidden');
      const bounds = (await panel.boundingBox())!;
      expect(bounds.y).toBeGreaterThanOrEqual(
        (await header.boundingBox())!.height,
      );
      expect(bounds.x).toBeGreaterThanOrEqual(10);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width - 10);
      await page.screenshot({
        path: 'data/header-invitations-' + width + '.png',
      });
      await page.keyboard.press('Tab');
      await page.keyboard.press('Escape');
      await expect(panel).toBeHidden();
      await expect(bell).toBeFocused();
      await bell.click();
      await expect(panel).toBeVisible();
      await page.getByRole('heading', { name: 'Ваши путешествия.' }).click();
      await expect(panel).toBeHidden();
      if (width < 700) {
        await header.getByRole('button', { name: 'Меню', exact: true }).click();
        const menu = page.getByRole('region', { name: 'Меню', exact: true });
        await expect(
          menu.getByRole('link', { name: 'О проекте' }),
        ).toBeVisible();
        await menu
          .getByRole('button', { name: 'Включить тёмную тему' })
          .click();
        await menu
          .getByRole('button', { name: 'Переключить на английский' })
          .click();
        await page.screenshot({
          path: 'data/header-menu-dark-' + width + '.png',
        });
        await page.keyboard.press('Escape');
        await header.getByRole('link', { name: 'My profile' }).click();
        await expect(page.locator('header.site-header')).toBeVisible();
        await page.getByRole('button', { name: 'Menu', exact: true }).click();
        await expect(
          page.getByRole('region', { name: 'Menu', exact: true }),
        ).toBeVisible();
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
      ).toBeFalsy();
      expect(errors).toEqual([]);
    },
  );
}
