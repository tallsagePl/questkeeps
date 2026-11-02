import { test, expect } from '@playwright/test';
import sharp from 'sharp';

for (const width of [393, 1024, 1440]) {
  test(
    'private anniversary memories and follow updates fit ' + width,
    async ({ page }) => {
      await page.setViewportSize({
        width,
        height: width === 1024 ? 1366 : 900,
      });
      const image = await sharp({
        create: { width: 320, height: 240, channels: 3, background: '#5050a0' },
      })
        .jpeg()
        .toBuffer();
      await page.route('**/api/**', async (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path.endsWith('/preview'))
          return route.fulfill({ body: image, contentType: 'image/jpeg' });
        if (path === '/api/me')
          return route.fulfill({
            json: {
              user: { id: 'memory-owner', name: 'Memory owner' },
              yandexEnabled: true,
            },
          });
        if (path === '/api/memories')
          return route.fulfill({
            json: {
              memories: Array.from({ length: 6 }, (_, i) => ({
                id: 'memory-' + i,
                taken: '2025-11-02',
                tripTitle: 'Поездка к морю',
                title: 'Фото',
                url: '/?trip=memory-trip',
                preview: '/api/media/memory-' + i + '/preview',
              })),
            },
          });
        if (path === '/api/invitations')
          return route.fulfill({
            json: {
              invitations: [],
              count: 0,
              friends: { friends: [], incoming: [], outgoing: [] },
              followChanges: [
                {
                  id: 'follow-trip',
                  title: 'Обновлённая поездка',
                  count: 3,
                  notes: 1,
                  stamp: 'v2',
                  url: '/s/fixture',
                },
              ],
              seen: [],
            },
          });
        return route.fulfill({
          json: {
            trips: [],
            friends: [],
            incoming: [],
            outgoing: [],
            queued: 0,
          },
        });
      });
      await page.goto('/');
      await expect(
        page.getByRole('heading', { name: 'В этот день' }),
      ).toBeVisible();
      await expect(page.locator('.anniversary-items a')).toHaveCount(6);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.getByRole('button', { name: /^Уведомления/ }).click();
      await expect(page.locator('a[href="/s/fixture"]')).toHaveAttribute(
        'href',
        '/s/fixture',
      );
      await page.screenshot({
        path: 'test-results/retention-' + width + '.png',
      });
      await page.keyboard.press('Escape');
      await page.evaluate(() => localStorage.setItem('ta-theme', 'dark'));
      await page.reload();
      await expect(page.locator('.anniversary-items a')).toHaveCount(6);
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await page.screenshot({
        path: 'test-results/retention-dark-' + width + '.png',
      });
    },
  );
}
