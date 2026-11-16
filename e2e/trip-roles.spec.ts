import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const publishName = 'Поделиться поездкой';

const manageName = 'Управление поездкой';

const otherDay = 'Первый день до приезда участников.';

const sharedDay = 'Мы встретились на набережной.';

const participation = { start: '2026-10-12', end: '2026-10-14' };

async function post(
  context: BrowserContext,
  base: string,
  path: string,
  data: Record<string, unknown>,
) {
  const response = await context.request.post(base + '/api/' + path, {
    headers: { origin: base },
    data,
  });
  expect(response.ok(), path).toBe(true);
  return response.json();
}

function button(page: Page, name: string) {
  return page.getByRole('button', { name, exact: true });
}

function memberRow(page: Page, name: string) {
  return page.locator('.member').filter({
    has: page.getByText(name, { exact: true }),
  });
}

test('owner delegates, manager shares and removes a member, guest reads, and journal writes respect participation', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(90000);
  const base = new URL(baseURL!).origin;
  const owner = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce',
  });
  const manager = await browser.newContext({
    viewport: { width: 1024, height: 1366 },
    hasTouch: true,
    reducedMotion: 'reduce',
  });
  const member = await browser.newContext({
    viewport: { width: 393, height: 852 },
    hasTouch: true,
    reducedMotion: 'reduce',
  });
  const guest = await browser.newContext({
    viewport: { width: 393, height: 852 },
    hasTouch: true,
    reducedMotion: 'reduce',
  });
  try {
    for (const [context, name] of [
      [owner, 'Владелец поездки'],
      [manager, 'Управляющий поездкой'],
      [member, 'Участник поездки'],
    ] as const) {
      await post(context, base, 'auth/register', {
        email: randomUUID() + '@fixture.invalid',
        name,
        password: 'RolesFixturePassword123',
      });
    }
    const { id: trip } = await post(owner, base, 'trips', {
      title: 'Дни в Стамбуле',
      destination: 'Стамбул',
      start: '2026-10-10',
      end: '2026-10-18',
    });
    for (const [context, allPhotos] of [
      [manager, false],
      [member, true],
    ] as const) {
      const invite = await post(owner, base, 'trips/' + trip + '/invite', {
        ...participation,
        allPhotos,
      });
      await post(context, base, 'invites/' + invite.url.split('/').at(-1), {});
    }
    for (const [day, text] of [
      ['2026-10-10', otherDay],
      ['2026-10-13', sharedDay],
    ]) {
      await post(owner, base, 'trips/' + trip + '/notes', { day, text });
    }

    const tripUrl = base + '/?trip=' + trip;
    const ownerPage = await owner.newPage();
    const managerPage = await manager.newPage();
    const memberPage = await member.newPage();
    await test.step('owner explicitly appoints a manager', async () => {
      await ownerPage.goto(tripUrl);
      await expect(button(ownerPage, publishName)).toBeVisible();
      await expect(
        ownerPage.getByText('Добавь описание своей поездки'),
      ).toBeVisible();
      await button(ownerPage, manageName).click();
      const managerRow = memberRow(ownerPage, 'Управляющий поездкой');
      await managerRow.getByRole('button', { name: 'Изменить' }).click();
      const dialog = ownerPage.getByRole('dialog');
      await dialog.getByRole('checkbox', { name: 'Управляющий' }).check();
      await dialog
        .getByRole('button', { name: 'Сохранить', exact: true })
        .click();
      await expect(dialog).toHaveCount(0);
      await expect(managerRow.getByText(/ · Управляющий$/)).toBeVisible();
    });

    await test.step('member and manager can read the full journal, but reply within their dates', async () => {
      for (const page of [memberPage, managerPage]) {
        await page.goto(tripUrl);
        await button(page, 'Дневник').click();
        const outside = page
          .locator('.note-thread')
          .filter({ hasText: otherDay });
        const inside = page
          .locator('.note-thread')
          .filter({ hasText: sharedDay });
        await expect(outside).toBeVisible();
        await expect(
          outside.getByRole('button', { name: 'Ответить' }),
        ).toHaveCount(0);
        await expect(
          inside.getByRole('button', { name: 'Ответить' }),
        ).toBeVisible();
        await expect(
          inside.getByRole('button', { name: 'Удалить запись' }),
        ).toHaveCount(0);
        const day = page.getByLabel('День поездки');
        await expect(day).toHaveAttribute('min', participation.start);
        await expect(day).toHaveAttribute('max', participation.end);
      }
      await memberPage
        .getByLabel('Что запомнилось?')
        .fill('Моя запись о поездке.');
      await button(memberPage, 'Сохранить запись').click();
      const ownNote = memberPage.locator('.note-thread').filter({
        hasText: 'Моя запись о поездке.',
      });
      await expect(ownNote).toBeVisible();
      await ownNote.getByRole('button', { name: 'Удалить запись' }).click();
      await expect(ownNote).toHaveCount(0);
      await expect(button(memberPage, publishName)).toHaveCount(0);
      await button(memberPage, manageName).click();
      await expect(button(memberPage, 'Пригласить участника')).toHaveCount(0);
      await expect(button(memberPage, 'Создать ссылку')).toHaveCount(0);
      await expect(button(memberPage, 'Выйти из поездки')).toBeVisible();
    });

    const shareUrl =
      await test.step('manager creates a publication and its guest link', async () => {
        const image = readFileSync('public/welcome/santorini.webp');
        const apiPath = base + '/api/trips/' + trip;
        // Use a bundled image in place of Drive media. The link still comes from SQLite.
        await managerPage.route(apiPath, async (route) => {
          const headers = { ...route.request().headers() };
          delete headers['if-none-match'];
          const response = await route.fetch({ headers });
          const data = await response.json();
          data.media.push({
            id: 'publication-fixture',
            name: 'Стамбул.webp',
            kind: 'photo',
            mime: 'image/webp',
            taken: '2026-10-13',
            hidden: 0,
            hidden_from_guests: 0,
            favorite: 1,
            revision: '1',
          });
          await route.fulfill({ response, json: data });
        });
        await managerPage.route(
          '**/api/media/publication-fixture/preview*',
          (route) => route.fulfill({ contentType: 'image/webp', body: image }),
        );
        await managerPage.goto(tripUrl);
        await button(managerPage, publishName).tap();
        const dialog = managerPage.getByRole('dialog', {
          name: 'Публикация из поездки',
        });
        await dialog.getByLabel('Добавить ссылку на эту поездку').check();
        await dialog
          .getByRole('button', { name: 'Создать предпросмотр' })
          .click();
        await expect(dialog.locator('.publish-result')).toHaveJSProperty(
          'naturalWidth',
          1080,
        );
        const link = await dialog
          .getByLabel('Ссылка для публикации')
          .inputValue();
        expect(new URL(link).pathname).toMatch(/^\/s\//);
        await managerPage.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
        return link;
      });

    const guestPage = await guest.newPage();
    await test.step('guest sees the published trip without edit controls', async () => {
      await guestPage.goto(shareUrl);
      await expect(
        guestPage.getByText('Гостевой просмотр', { exact: true }),
      ).toBeVisible();
      await expect(button(guestPage, manageName)).toHaveCount(0);
      await expect(button(guestPage, publishName)).toHaveCount(0);
      await button(guestPage, 'Дневник').tap();
      await expect(
        guestPage.getByText(sharedDay, { exact: true }),
      ).toBeVisible();
      await expect(
        guestPage.getByText('Добавь описание своей поездки'),
      ).toHaveCount(0);
      await expect(button(guestPage, 'Сохранить запись')).toHaveCount(0);
      await expect(button(guestPage, 'Ответить')).toHaveCount(0);
      expect(
        await guestPage.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    });

    await test.step('manager can remove a member and revoke access after confirmation', async () => {
      await button(managerPage, manageName).click();
      await expect(button(managerPage, 'Пригласить участника')).toBeVisible();
      await expect(
        managerPage.getByRole('heading', { name: 'Обложка поездки' }),
      ).toHaveCount(0);
      const row = memberRow(managerPage, 'Участник поездки');
      await row.getByRole('button', { name: 'Изменить' }).click();
      const dialog = managerPage.getByRole('dialog');
      await expect(
        dialog.getByRole('checkbox', { name: 'Управляющий' }),
      ).toHaveCount(0);
      await dialog.getByRole('button', { name: 'Завершить участие' }).click();
      await dialog.getByRole('button', { name: 'Отмена', exact: true }).click();
      await expect(row.getByText(/ · Участник$/)).toBeVisible();
      await dialog.getByRole('button', { name: 'Завершить участие' }).click();
      await dialog.getByRole('button', { name: 'Исключить участника' }).click();
      await expect(row.getByText(/ · Покинул поездку$/)).toBeVisible();
      await button(managerPage, 'Отозвать доступ').click();
      await button(managerPage, 'Отозвать ссылку').click();
      await expect(
        managerPage.getByText('Доступ по ссылке выключен'),
      ).toBeVisible();
      await guestPage.reload();
      await expect(
        guestPage.getByRole('heading', { name: 'Ссылка недоступна' }),
      ).toBeVisible();
    });
  } finally {
    await Promise.all([
      owner.close(),
      manager.close(),
      member.close(),
      guest.close(),
    ]);
  }
});
