import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

async function register(page: Page, baseURL: string) {
  const response = await page.request.post('/api/auth/register', {
    headers: { origin: new URL(baseURL).origin },
    data: {
      name: 'Путешественник',
      email: 'archive-' + randomUUID() + '@example.test',
      password: 'TravelPassword123',
    },
  });
  expect(response.ok()).toBe(true);
}

for (const canceled of [false, true]) {
  test(`форма сохраняется после ${canceled ? 'отмены подключения' : 'подключения'} Диска`, async ({
    page,
    baseURL,
  }) => {
    await register(page, baseURL!);
    let linked = false;
    await page.route('**/api/me', async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        json: { ...(await response.json()), yandexEnabled: true },
      });
    });
    await page.route('**/api/accounts', (route) =>
      route.fulfill({
        json: { accounts: linked ? [{ id: 'draft-disk', label: 'Диск' }] : [] },
      }),
    );
    await page.route('**/api/accounts/draft-disk/folders?**', (route) =>
      route.fulfill({ json: { folders: [], nextOffset: null } }),
    );
    await page.route('**/api/auth/yandex?**', async (route) => {
      const query = new URL(route.request().url()).searchParams;
      expect(query.get('intent')).toBe('link');
      const returnTo = query.get('returnTo');
      expect(returnTo).toBe('/?create=1');
      linked = !canceled;
      const location = canceled
        ? '/auth/error?' +
          new URLSearchParams({
            reason: 'access_denied',
            intent: 'link',
            returnTo: returnTo!,
          })
        : returnTo!;
      await route.fulfill({ status: 303, headers: { location } });
    });

    await page.goto('/');
    const create = page.getByRole('button', {
      name: 'Новая поездка',
      exact: true,
    });
    await expect(create).toHaveCount(1);
    await expect(
      page.getByRole('button', { name: 'Создать первую поездку', exact: true }),
    ).toHaveCount(0);
    await create.click();
    const dialog = page.getByRole('dialog');
    const title = dialog.getByLabel('Название поездки');
    const route = dialog.getByLabel('Маршрут', { exact: true });
    const start = dialog.getByLabel('Начало', { exact: true });
    const end = dialog.getByLabel('Окончание', { exact: true });
    const description = dialog.getByLabel('Пара слов о поездке');
    const selectFolder = dialog.getByRole('button', {
      name: 'Выбрать папку Яндекс Диска',
    });
    await expect(title).toBeVisible();
    expect((await start.boundingBox())!.y).toBeLessThan(
      (await selectFolder.boundingBox())!.y,
    );
    await title.fill('Дороги Ликии');
    await route.fill('Каш');
    await dialog.getByRole('button', { name: 'Добавить', exact: true }).click();
    await route.fill('Олюдениз');
    await start.fill('2026-10-10');
    await end.fill('2026-10-18');
    await dialog.getByText('Добавить описание', { exact: true }).click();
    await description.fill('Море и горы');
    await selectFolder.click();
    await dialog
      .getByRole('link', { name: 'Подключить аккаунт Яндекса' })
      .click();
    if (canceled)
      await page.getByRole('link', { name: 'Вернуться в QuestKeeps' }).click();

    await expect(dialog).toBeVisible();
    await expect(title).toHaveValue('Дороги Ликии');
    await expect(route).toHaveValue('Олюдениз');
    await expect(
      dialog.getByRole('list', { name: 'Выбранные маршруты' }),
    ).toContainText('Каш');
    await expect(start).toHaveValue('2026-10-10');
    await expect(end).toHaveValue('2026-10-18');
    await expect(description).toHaveValue('Море и горы');

    if (canceled) {
      await dialog
        .getByRole('button', { name: 'Создать путешествие', exact: true })
        .click();
      await expect(
        page.getByRole('heading', { name: 'Дороги Ликии.' }),
      ).toBeVisible();
    } else {
      await dialog
        .getByRole('button', { name: 'Закрыть', exact: true })
        .click();
      await create.click();
      await expect(title).toHaveValue('');
    }
  });
}

test('на 320 px все вкладки видны и папка подключается из галереи', async ({
  page,
  baseURL,
}) => {
  await register(page, baseURL!);
  const result = await page.request.post('/api/trips', {
    headers: { origin: new URL(baseURL!).origin },
    data: {
      title: 'Горный маршрут',
      destination: 'Тбилиси',
      start: '2026-10-10',
      end: '2026-10-18',
    },
  });
  expect(result.ok()).toBe(true);
  const trip = await result.json();
  await page.setViewportSize({ width: 320, height: 760 });
  await page.route('**/api/accounts', (route) =>
    route.fulfill({
      json: { accounts: [{ id: 'my-disk', label: 'Мой Диск' }] },
    }),
  );
  await page.goto('/?trip=' + trip.id);
  const nav = page.locator('.tabbar nav');
  const manage = nav.getByRole('button', { name: 'Управление поездкой' });
  await expect(manage).toBeVisible();
  await expect(nav.getByRole('button')).toHaveCount(6);
  expect(await nav.evaluate((el) => el.scrollWidth)).toBe(
    await nav.evaluate((el) => el.clientWidth),
  );
  const bounds = (await manage.boundingBox())!;
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
  expect(bounds.height).toBeGreaterThanOrEqual(44);

  await page
    .getByRole('button', { name: 'Подключить папку', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Подключить папку' });
  await expect(dialog.getByRole('combobox')).toBeEnabled();
  await expect(dialog.getByRole('option', { name: 'Мой Диск' })).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.goto('/?trip=' + trip.id + '&source=1');
  await expect(dialog.getByRole('combobox')).toBeEnabled();
  expect(new URL(page.url()).searchParams.has('source')).toBe(false);
  await dialog.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await manage.click();
  await expect(
    page.getByText('Доступ по ссылке выключен', { exact: true }),
  ).toBeVisible();
});
