import { test, expect } from '@playwright/test';
import sharp from 'sharp';

for (const mobile of [false, true])
  test(
    'choose missing GPS on a map and save ' +
      (mobile ? 'on mobile' : 'on desktop'),
    async ({ page }) => {
      if (mobile) await page.setViewportSize({ width: 390, height: 844 });
      const trip = {
        id: 'location-trip',
        title: 'Место съёмки',
        destination: 'Стамбул',
        start: '2026-10-10',
        end: '2026-10-18',
        from: '2026-10-10',
        to: '2026-10-18',
        role: 'owner',
        sharing: false,
        description: '',
      };
      const missing = {
        id: 'no-gps',
        name: 'Без GPS.jpg',
        kind: 'photo',
        mime: 'image/jpeg',
        taken: '2026-10-11T12:00:00',
        author: 'Автор',
        user_id: 'owner',
        lat: null as number | null,
        lon: null as number | null,
        hidden: 0,
        revision: '1',
      };
      const nearby = {
        ...missing,
        id: 'nearby',
        name: 'С координатами.jpg',
        lat: 41.01,
        lon: 28.98,
        taken: '2026-10-11T12:01:00',
      };
      let saved: { lat: number; lon: number } | undefined;
      await page.route('**/api/me', (r) =>
        r.fulfill({
          json: { user: { id: 'owner', name: 'Автор' }, yandexEnabled: true },
        }),
      );
      await page.route('**/api/trips', (r) =>
        r.fulfill({ json: { trips: [trip] } }),
      );
      await page.route('**/api/trips/location-trip', (r) =>
        r.fulfill({
          json: {
            trip,
            media: [missing, nearby],
            places: [],
            notes: [],
            sources: [],
          },
        }),
      );
      await page.route('**/api/trips/location-trip/area-suggestions', (r) =>
        r.fulfill({ json: { candidates: [], incomplete: false } }),
      );
      await page.route('**/api/media/*/places', (r) =>
        r.fulfill({ json: { suggestions: [] } }),
      );
      await page.route('**/api/media/no-gps', (r) => {
        if (r.request().method() === 'PATCH') {
          saved = r.request().postDataJSON();
          Object.assign(missing, saved);
          return r.fulfill({ json: { ok: true } });
        }
        return r.fulfill({ json: { media: missing } });
      });
      const image = await sharp({
        create: { width: 320, height: 240, channels: 3, background: '#886633' },
      })
        .jpeg()
        .toBuffer();
      await page.route('**/api/media/*/preview*', (r) =>
        r.fulfill({ body: image, contentType: 'image/jpeg' }),
      );
      await page.route('**/api/media/*/original*', (r) =>
        r.fulfill({ body: image, contentType: 'image/jpeg' }),
      );
      await page.route('https://services.arcgisonline.com/**', (r) =>
        r.fulfill({ body: image, contentType: 'image/jpeg' }),
      );
      await page.route('https://*.tile.openstreetmap.org/**', (r) =>
        r.fulfill({ body: image, contentType: 'image/jpeg' }),
      );
      await page.goto('/?trip=location-trip');
      await page
        .getByRole('button', { name: /^Открыть фото: Без GPS/ })
        .click();
      const modal = page.getByRole('dialog');
      const form = modal.locator('.location-form');
      await expect(form.getByLabel('Широта', { exact: true })).toHaveValue('');
      const button = form.getByRole('button', {
        name: 'Выбрать на карте',
        exact: true,
      });
      await expect(button.locator('svg')).toBeVisible();
      await button.click();
      await expect(
        form.getByRole('button', { name: 'Скрыть карту', exact: true }),
      ).toHaveAttribute('aria-expanded', 'true');
      const map = form.getByRole('region', {
        name: 'Выбор места съёмки на карте',
      });
      await expect(map).toHaveClass(/leaflet-container/);
      await expect(map.locator('.leaflet-marker-icon')).toHaveCount(0);
      await map.scrollIntoViewIfNeeded();
      const box = (await map.boundingBox())!;
      await map.click({
        position: {
          x: Math.round(box.width * 0.6),
          y: Math.round(box.height * 0.45),
        },
      });
      await expect(map.locator('.leaflet-marker-icon')).toHaveCount(1);
      const firstLat = Number(
        await form.getByLabel('Широта', { exact: true }).inputValue(),
      );
      const firstLon = Number(
        await form.getByLabel('Долгота', { exact: true }).inputValue(),
      );
      expect(firstLat).toBeGreaterThan(40);
      expect(firstLat).toBeLessThan(42);
      expect(firstLon).toBeGreaterThan(28);
      expect(firstLon).toBeLessThan(30);
      const pin = (await map.locator('.leaflet-marker-icon').boundingBox())!;
      await page.mouse.move(pin.x + pin.width / 2, pin.y + pin.height / 2);
      await page.mouse.down();
      await page.mouse.move(
        pin.x + pin.width / 2 + 30,
        pin.y + pin.height / 2 + 20,
        { steps: 5 },
      );
      await page.mouse.up();
      await expect
        .poll(async () =>
          Number(
            await form.getByLabel('Долгота', { exact: true }).inputValue(),
          ),
        )
        .not.toBe(firstLon);
      await form.getByLabel('Широта', { exact: true }).fill('41.012345');
      await form.getByLabel('Долгота', { exact: true }).fill('28.987654');
      await expect(map.locator('.leaflet-marker-icon')).toHaveCount(1);
      await form
        .getByRole('button', {
          name: 'Выбрать точку в центре карты',
          exact: true,
        })
        .click();
      const lat = Number(
        await form.getByLabel('Широта', { exact: true }).inputValue(),
      );
      const lon = Number(
        await form.getByLabel('Долгота', { exact: true }).inputValue(),
      );
      expect(lat).toBeCloseTo(41.01, 2);
      expect(lon).toBeCloseTo(28.98, 2);
      expect(saved).toBeUndefined();
      await form.screenshot({
        path:
          'test-results/location-picker-' +
          (mobile ? 'mobile' : 'wide') +
          '.png',
      });
      expect(
        await form.evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
      await form
        .getByRole('button', { name: 'Скрыть карту', exact: true })
        .click();
      await expect(map).toHaveCount(0);
      expect(
        Number(await form.getByLabel('Широта', { exact: true }).inputValue()),
      ).toBe(lat);
      await form
        .getByRole('button', { name: 'Сохранить координаты', exact: true })
        .click();
      await expect.poll(() => saved).toEqual({ lat, lon });
      await expect(form).toHaveCount(0);
    },
  );
