import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import sharp from 'sharp';

async function fixture(
  page: import('@playwright/test').Page,
  favorites = true,
) {
  const image = fs.readFileSync('public/welcome/santorini.webp');
  const media = Array.from({ length: 7 }, (_, index) => ({
    id: 'frame-' + index,
    name: 'photo-' + index + '.jpg',
    title: index === 0 ? 'На берегу Эгейского моря' : 'Моменты путешествия',
    kind: 'photo',
    mime: 'image/jpeg',
    user_id: 'owner',
    author: 'Fixture',
    taken: '2026-10-11',
    hidden: 0,
    favorite: favorites && index !== 6 ? 1 : 0,
    hidden_from_guests: index === 5 ? 1 : 0,
    revision: '1',
    rotation: index === 1 ? 90 : 0,
    lat: null,
    lon: null,
  }));
  let enabled = false;
  let shareWrites = 0;
  const previews: string[] = [];
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      value: () => true,
    });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data: ShareData) => {
        (window as any).__shared = {
          files: data.files?.map((file) => ({
            name: file.name,
            type: file.type,
            size: file.size,
          })),
          text: data.text,
        };
      },
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          (window as any).__copied = text;
        },
      },
    });
  });
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/preview')) {
      previews.push(path);
      return route.fulfill({ body: image, contentType: 'image/webp' });
    }
    if (path === '/api/trips/frame/share') {
      if (route.request().method() === 'POST') {
        enabled = true;
        shareWrites++;
      }
      return route.fulfill({
        json: {
          url: enabled
            ? new URL('/s/fixture-share', route.request().url()).href
            : null,
        },
      });
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
                trip: {
                  id: 'frame',
                  title: 'Наше маленькое греческое лето',
                  destination: 'Санторини, Греция',
                  description: '',
                  start: '2026-10-10',
                  end: '2026-10-18',
                  from: '2026-10-10',
                  to: '2026-10-18',
                  role: 'owner',
                  sharing: false,
                },
                media,
                places: [],
                notes: [],
              }
            : {
                invitations: [],
                count: 0,
                friends: { friends: [], incoming: [], outgoing: [] },
                accepted: [],
                seen: [],
                drive: [],
                driveChanges: [],
                trips: [],
                groups: [],
                sources: [],
              },
    });
  });
  return { previews, shareWrites: () => shareWrites };
}

test('exports a branded post and up to five stories, shares real PNG files and keeps private frames out', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const state = await fixture(page);
  await page.goto('/?trip=frame');
  await page
    .getByRole('button', { name: 'Поделиться поездкой', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Публикация из поездки' });
  await dialog.getByRole('button', { name: 'Создать предпросмотр' }).click();
  await expect(dialog.locator('.publish-result')).toHaveJSProperty(
    'naturalWidth',
    1080,
  );
  await expect(dialog.locator('.publish-result')).toHaveJSProperty(
    'naturalHeight',
    1350,
  );
  expect(state.shareWrites()).toBe(0);
  const postDownload = page.waitForEvent('download');
  await dialog.locator('.publish-downloads a').first().click();
  const post = await postDownload;
  await post.saveAs('data/publication-post.png');
  const postInfo = await sharp('data/publication-post.png').metadata();
  expect([postInfo.width, postInfo.height]).toEqual([1080, 1350]);
  await dialog
    .getByRole('combobox', { name: 'Формат', exact: true })
    .selectOption('stories');
  await dialog.getByLabel('Количество историй').selectOption('5');
  await dialog.getByLabel('Добавить ссылку на эту поездку').check();
  await expect(
    dialog.getByText('При создании публикации включится гостевой просмотр.', {
      exact: false,
    }),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Создать предпросмотр' }).click();
  await expect(dialog.locator('.publish-downloads a')).toHaveCount(5);
  await expect(dialog.locator('.publish-result')).toHaveJSProperty(
    'naturalHeight',
    1920,
  );
  expect(state.shareWrites()).toBe(1);
  await dialog.getByRole('button', { name: 'Поделиться файлами…' }).click();
  const shared = await page.evaluate(() => (window as any).__shared);
  expect(shared.files).toHaveLength(5);
  expect(
    shared.files.every(
      (file: any) => file.type === 'image/png' && file.size > 1000,
    ),
  ).toBeTruthy();
  expect(shared.text).toContain('/s/fixture-share');
  expect(shared.text).toContain('QuestKeeps');
  await dialog
    .getByRole('button', { name: 'Скопировать ссылку', exact: true })
    .click();
  expect(await page.evaluate(() => (window as any).__copied)).toContain(
    '/s/fixture-share',
  );
  await dialog.getByRole('button', { name: 'Telegram', exact: true }).click();
  await expect(
    dialog.getByRole('link', { name: 'Отправить ссылку в Telegram' }),
  ).toHaveAttribute('href', /^https:\/\/t\.me\/share\/url\?/);
  const storyDownload = page.waitForEvent('download');
  await dialog.locator('.publish-downloads a').first().click();
  await (await storyDownload).saveAs('data/publication-story.png');
  await dialog.locator('.publish-photo-picker summary').click();
  await expect(
    dialog.getByRole('checkbox', { name: 'photo-5.jpg', exact: true }),
  ).toHaveCount(0);
  await expect(dialog.locator('.publish-photo-option')).toHaveCount(5);
  await expect(
    dialog.getByRole('checkbox', { name: 'photo-6.jpg', exact: true }),
  ).toHaveCount(0);
  await page.screenshot({ path: 'data/publication-editor-desktop.png' });
});

test('publication controls, preview and download fit a phone', async ({
  page,
}) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await fixture(page);
  await page.goto('/?trip=frame');
  await page
    .getByRole('button', { name: 'Поделиться поездкой', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Публикация из поездки' });
  await dialog
    .getByRole('combobox', { name: 'Формат', exact: true })
    .selectOption('stories');
  await dialog.getByRole('button', { name: 'Создать предпросмотр' }).click();
  await expect(dialog.locator('.publish-result')).toHaveJSProperty(
    'naturalHeight',
    1920,
  );
  expect(
    await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBeTruthy();
  await dialog.locator('.publish-result').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'data/publication-editor-mobile.png' });
});

test('publication requires favorites and explains how to select them', async ({
  page,
}) => {
  await fixture(page, false);
  await page.goto('/?trip=frame');
  await page
    .getByRole('button', { name: 'Поделиться поездкой', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Публикация из поездки' });
  await expect(
    dialog.getByText('Добавьте фотографии в избранное', { exact: false }),
  ).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Создать предпросмотр' }),
  ).toBeDisabled();
});
