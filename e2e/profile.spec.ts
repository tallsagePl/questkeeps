import { test, expect } from '@playwright/test';
import sharp from 'sharp';
import AxeBuilder from '@axe-core/playwright';

test('профиль: никнейм, своя аватарка, отдельное фото Яндекса и отключение', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Первый раз здесь? Зарегистрироваться' })
    .click();
  await page.getByLabel('Как вас зовут').fill('Before');
  await page
    .getByLabel('Электронная почта')
    .fill('profile-' + Date.now() + '@example.test');
  await page.getByLabel('Пароль', { exact: true }).fill('TravelPassword123');
  await page
    .getByLabel('Повторите пароль', { exact: true })
    .fill('TravelPassword123');
  await page
    .getByRole('button', { name: 'Создать аккаунт', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Ваши путешествия.' }),
  ).toBeVisible();
  await page.locator('.user-button').click();
  await expect(page.getByLabel('Никнейм', { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Сохранить никнейм' }),
  ).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Изменить никнейм', exact: true })
    .click();
  await expect(page.getByLabel('Никнейм', { exact: true })).toBeFocused();
  await page.getByLabel('Никнейм', { exact: true }).fill('Discard this');
  await page.getByRole('button', { name: 'Отмена', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Изменить никнейм', exact: true }),
  ).toBeFocused();
  await expect(page.locator('.profile-name-display')).toContainText('Before');
  await page
    .getByRole('button', { name: 'Изменить никнейм', exact: true })
    .click();
  await expect(page.getByLabel('Никнейм', { exact: true })).toHaveValue(
    'Before',
  );
  await page.getByLabel('Никнейм', { exact: true }).fill('Explorer');
  await page.getByRole('button', { name: 'Сохранить никнейм' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Никнейм сохранён' }),
  ).toBeVisible();
  await expect(page.locator('.user-button')).toHaveText('EExplorer');
  await expect(page.getByLabel('Никнейм', { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Изменить никнейм', exact: true }),
  ).toBeFocused();
  await expect(page.getByLabel('Юзернейм', { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Загрузить своё фото', exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Изменить юзернейм', exact: true })
    .click();
  await expect(page.getByLabel('Юзернейм', { exact: true })).toBeFocused();
  await page
    .getByLabel('Юзернейм', { exact: true })
    .fill('explorer_' + Date.now());
  await page
    .getByRole('button', { name: 'Сохранить юзернейм', exact: true })
    .click();
  await expect(page.getByLabel('Юзернейм', { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Изменить юзернейм', exact: true }),
  ).toBeFocused();
  await page
    .getByRole('button', { name: 'Изменить аватарку', exact: true })
    .click();
  const photo = await sharp({
    create: { width: 80, height: 100, channels: 3, background: '#dd4433' },
  })
    .png()
    .toBuffer();
  await page
    .getByLabel('Файл аватарки')
    .setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: photo });
  await expect(
    page.getByRole('status').filter({ hasText: 'Аватарка обновлена' }),
  ).toBeVisible();
  await expect(page.locator('.avatar-edit-controls')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Изменить аватарку', exact: true }),
  ).toBeFocused();
  await expect(page.locator('.profile-avatar img')).toBeVisible();
  await expect(page.locator('.profile-avatar img')).toHaveJSProperty(
    'naturalWidth',
    512,
  );
  const custom = await page.locator('.profile-avatar img').getAttribute('src');
  await page.reload();
  await expect(page.locator('.profile-name-display')).toContainText('Explorer');
  await expect(page.getByLabel('Никнейм', { exact: true })).toHaveCount(0);
  await expect(page.locator('.profile-avatar img')).toHaveAttribute(
    'src',
    custom!,
  );
  const me = await page.request.get('/api/me');
  const stored = (await me.json()).user;
  let connected = true;
  await page.route('**/api/me', (r) =>
    r.request().method() === 'GET'
      ? r.fulfill({
          json: {
            user: {
              ...stored,
              yandexAccountId: connected ? 'yandex-disk' : null,
            },
            yandexEnabled: true,
          },
        })
      : r.continue(),
  );
  await page.route('**/api/accounts', (r) =>
    r.fulfill({
      json: {
        accounts: connected
          ? [
              {
                id: 'yandex-disk',
                label: 'VeryLongYandexAccountName_12345678901234567890',
              },
            ]
          : [],
      },
    }),
  );
  await page.route('**/api/accounts/yandex-disk/avatar', (r) =>
    r.fulfill({ body: photo, contentType: 'image/png' }),
  );
  await page.route('**/api/accounts/yandex-disk', (r) => {
    connected = false;
    return r.fulfill({ json: { user: { ...stored, yandexAccountId: null } } });
  });
  await page.reload();
  await expect(
    page.locator('.profile-yandex .connected-account img'),
  ).toHaveAttribute('src', '/api/accounts/yandex-disk/avatar');
  await expect(page.locator('.profile-avatar img')).toHaveAttribute(
    'src',
    custom!,
  );
  await expect(
    page.locator('.profile-yandex .account-identity strong'),
  ).toHaveCSS('white-space', 'nowrap');
  const loginBox = await page
    .locator('.profile-yandex .account-identity')
    .boundingBox();
  const stateBox = await page
    .locator('.profile-yandex .connection-state')
    .boundingBox();
  expect(stateBox!.y).toBeGreaterThanOrEqual(loginBox!.y + loginBox!.height);
  await expect(
    page.getByRole('link', { name: 'Подключить аккаунт Яндекса', exact: true }),
  ).toHaveCount(0);
  for (const theme of ['light', 'dark']) {
    await page.evaluate(
      (theme) => (document.documentElement.dataset.theme = theme),
      theme,
    );
    const results = await new AxeBuilder({ page })
      .include('#main-content')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/profile-mobile.png' });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole('button', { name: 'Отключить Яндекс', exact: true })
    .click();
  await expect(
    page.getByRole('link', { name: 'Подключить аккаунт Яндекса', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.profile-avatar img')).toHaveAttribute(
    'src',
    custom!,
  );
  await page
    .getByRole('button', { name: 'Изменить аватарку', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Удалить своё фото', exact: true })
    .click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Своя аватарка удалена' }),
  ).toBeVisible();
  await expect(page.locator('.profile-avatar img')).toHaveCount(0);
});
