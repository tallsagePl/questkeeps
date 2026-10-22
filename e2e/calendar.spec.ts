import { test, expect } from '@playwright/test';

test('календарь переходит между годами, ограничивает даты и закрывается с клавиатуры', async ({
  page,
}) => {
  const trip = {
    id: 'calendar',
    title: 'Зимняя поездка',
    destination: 'Москва',
    start: '2026-12-30',
    end: '2027-01-03',
    from: '2026-12-30',
    to: '2027-01-03',
    role: 'owner',
    sharing: false,
    description: '',
  };
  await page.route('**/api/me', (r) =>
    r.fulfill({
      json: { user: { id: 'owner', name: 'Автор' }, yandexEnabled: true },
    }),
  );
  await page.route('**/api/trips', (r) =>
    r.fulfill({ json: { trips: [trip] } }),
  );
  await page.route('**/api/trips/calendar', (r) =>
    r.fulfill({
      json: {
        trip,
        media: [],
        notes: [],
        places: [],
        importStatus: { sourceCount: 1, waiting: false, syncing: false },
      },
    }),
  );
  await page.goto('/?trip=calendar');
  const trigger = page.getByRole('button', {
    name: 'День поездки: Все дни',
    exact: true,
  });
  await trigger.click();
  const calendar = page.locator('.trip-calendar-popover');
  await expect(calendar.locator('.in-trip')).toHaveCount(2);
  await expect(
    calendar.getByRole('button', { name: 'Предыдущий месяц' }),
  ).toBeDisabled();
  await calendar.getByRole('button', { name: 'Следующий месяц' }).click();
  await expect(calendar.locator('.in-trip')).toHaveCount(3);
  await expect(
    calendar.getByRole('button', { name: 'Следующий месяц' }),
  ).toBeDisabled();
  await calendar
    .getByRole('button', { name: '3 января 2027 г.', exact: true })
    .click();
  const selected = page.getByRole('button', {
    name: 'День поездки: 3 января 2027 г.',
    exact: true,
  });
  await page.keyboard.press('Escape');
  await expect(selected).toBeFocused();
  await selected.click();
  await expect(
    calendar.getByRole('button', { name: '3 января 2027 г.', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('ArrowLeft');
  await expect(
    calendar.getByRole('button', { name: '2 января 2027 г.', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(calendar).toHaveCount(0);
  await expect(selected).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await selected.click();
  await expect(calendar).toBeVisible();
  const bounds = await calendar.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
});
