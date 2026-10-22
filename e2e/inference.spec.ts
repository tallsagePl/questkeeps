import { test, expect, type Page } from '@playwright/test';
async function register(page: Page) {
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Первый раз здесь? Зарегистрироваться' })
    .click();
  await page.getByLabel('Как вас зовут').fill('Путешественник');
  await page
    .getByLabel('Электронная почта')
    .fill('infer-' + Date.now() + '@example.test');
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
}
async function folder(page: Page) {
  await page
    .getByRole('button', { name: 'Выбрать папку Яндекс Диска' })
    .click();
  await page.getByRole('button', { name: 'Грузия', exact: true }).click();
  await page
    .getByRole('button', { name: 'Выбрать эту папку', exact: true })
    .click();
}
async function mockAccounts(page: Page) {
  await page.route('**/api/accounts', (route) =>
    route.fulfill({
      json: { accounts: [{ id: 'my-disk', label: 'Мой Диск' }] },
    }),
  );
  await page.route('**/api/accounts/my-disk/folders?**', (route) => {
    const root =
      new URL(route.request().url()).searchParams.get('path') === 'disk:/';
    return route.fulfill({
      json: {
        path: root ? 'disk:/' : 'disk:/Грузия',
        folders: root ? [{ name: 'Грузия', path: 'disk:/Грузия' }] : [],
        nextOffset: null,
      },
    });
  });
}
test('даты и место включаются независимо, результаты редактируются вручную', async ({
  page,
}) => {
  await register(page);
  await mockAccounts(page);
  const calls: any[] = [];
  await page.route('**/api/trips/infer', (route) => {
    const input = route.request().postDataJSON();
    calls.push(input);
    return route.fulfill({
      json: {
        photoCount: 12,
        datedCount: 12,
        gpsCount: 10,
        start: input.dates ? '2026-10-10' : null,
        end: input.dates ? '2026-10-18' : null,
        destination: input.destination
          ? 'Tbilisi → Stepantsminda · Грузия'
          : null,
        route: input.destination
          ? [
              { name: 'Tbilisi', country: 'GE', distanceKm: 0 },
              { name: 'Stepantsminda', country: 'GE', distanceKm: 0 },
            ]
          : [],
        warnings: {},
      },
    });
  });
  await page
    .getByRole('button', { name: 'Новая поездка', exact: true })
    .click();
  await page.getByLabel('Название поездки').fill('Фотоархив Грузии');
  await folder(page);
  await page.getByRole('checkbox', { name: /Определить даты по фото/ }).check();
  await expect(page.locator('input[name="start"]')).toHaveValue('2026-10-10');
  await expect(page.locator('input[name="end"]')).toHaveValue('2026-10-18');
  await expect(
    page.getByRole('list', { name: 'Выбранные города' }).locator('li'),
  ).toHaveCount(0);
  expect(calls[0].destination).toBe(false);
  await page
    .getByRole('checkbox', { name: /Определить место по фото/ })
    .check();
  await expect(
    page.getByRole('list', { name: 'Выбранные города' }),
  ).toContainText('Tbilisi');
  await expect(
    page.getByRole('list', { name: 'Выбранные города' }),
  ).toContainText('Stepantsminda');
  await page.screenshot({
    path: 'test-results/create-inference-desktop.png',
    fullPage: true,
  });
  for (const list of ['Выбранные города', 'Выбранные страны']) {
    const buttons = page.getByRole('list', { name: list }).getByRole('button');
    while (await buttons.count()) await buttons.first().click();
  }
  await page
    .getByLabel('Маршрут', { exact: true })
    .fill('Наш маршрут по Грузии');
  await page.getByRole('button', { name: 'Добавить', exact: true }).click();
  await expect(
    page.getByRole('checkbox', { name: /Определить место по фото/ }),
  ).not.toBeChecked();
  await expect(
    page.getByRole('checkbox', { name: /Определить даты по фото/ }),
  ).toBeChecked();
  await page.getByLabel('Начало', { exact: true }).fill('2026-10-09');
  await expect(
    page.getByRole('checkbox', { name: /Определить даты по фото/ }),
  ).not.toBeChecked();
  await expect(page.getByLabel('Окончание', { exact: true })).toHaveValue(
    '2026-10-18',
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: 'test-results/create-inference-mobile.png',
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.route('**/api/trips', async (route) => {
    if (route.request().method() === 'POST') {
      const input = route.request().postDataJSON();
      expect(input.source).toEqual({
        accountId: 'my-disk',
        path: 'disk:/Грузия',
      });
      expect(input.start).toBe('2026-10-09');
      expect(input.destination).toBe('Наш маршрут по Грузии');
      const { source, ...manual } = input;
      const response = await route.fetch({ postData: manual });
      await route.fulfill({ response });
    } else await route.continue();
  });
  await page
    .getByRole('button', { name: 'Создать путешествие', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Фотоархив Грузии.' }),
  ).toBeVisible();
});
test('нет метаданных: локальные пояснения и ручной ввод остаются доступны', async ({
  page,
}) => {
  await register(page);
  await mockAccounts(page);
  await page.route('**/api/trips/infer', (route) =>
    route.fulfill({
      json: {
        photoCount: 2,
        datedCount: 0,
        gpsCount: 0,
        start: null,
        end: null,
        destination: null,
        warnings: {
          dates: 'В фотографиях нет даты съёмки — укажите даты вручную',
          destination: 'В фотографиях нет координат — укажите место вручную',
        },
      },
    }),
  );
  await page
    .getByRole('button', { name: 'Новая поездка', exact: true })
    .click();
  await folder(page);
  await page.getByRole('checkbox', { name: /Определить даты по фото/ }).check();
  await page
    .getByRole('checkbox', { name: /Определить место по фото/ })
    .check();
  await expect(
    page.getByText('В фотографиях нет координат — укажите место вручную', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText('В фотографиях нет даты съёмки — укажите даты вручную', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByLabel('Маршрут', { exact: true })).toBeEditable();
  await expect(page.getByLabel('Начало', { exact: true })).toHaveValue('');
  await expect(page.locator('.error-bar,.toast')).toHaveCount(0);
});

test('несколько Дисков: выбранный аккаунт определяет папку и видимый статус', async ({
  page,
}) => {
  await register(page);
  await page.route('**/api/accounts', (route) =>
    route.fulfill({
      json: {
        accounts: [
          { id: 'personal', label: 'Личный' },
          { id: 'family', label: 'Семейный' },
        ],
      },
    }),
  );
  await page.route('**/api/accounts/*/folders?**', (route) =>
    route.fulfill({
      json: {
        folders: [
          {
            name: route.request().url().includes('/family/')
              ? 'Общий отпуск'
              : 'Мои поездки',
            path: 'disk:/trip',
          },
        ],
        nextOffset: null,
      },
    }),
  );
  await page
    .getByRole('button', { name: 'Новая поездка', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Выбрать папку Яндекс Диска' })
    .click();
  const accounts = page.getByRole('group', { name: 'Аккаунт Яндекса' });
  await expect(accounts.getByRole('radio')).toHaveCount(2);
  await accounts.getByRole('radio', { name: /Личный/ }).check();
  await expect(
    page.getByRole('button', { name: 'Мои поездки', exact: true }),
  ).toBeVisible();
  await accounts.getByRole('radio', { name: /Семейный/ }).check();
  await expect(
    page.getByRole('button', { name: 'Общий отпуск', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Мои поездки', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Общий отпуск', exact: true }).click();
  await page
    .getByRole('button', { name: 'Выбрать эту папку', exact: true })
    .click();
  await expect(page.locator('.connected-account')).toContainText('Семейный');
  await expect(page.locator('.connected-account')).toContainText('Подключён');
  await expect(page.getByText('Папка выбрана', { exact: true })).toBeVisible();
});

test('поиск пропускает страницы файлов, показывает результат и прокручивается внутри окна', async ({
  page,
}) => {
  await register(page);
  await mockAccounts(page);
  let release: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const offsets: number[] = [];
  await page.route('**/api/accounts/my-disk/folders?**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.searchParams.get('path');
    const offset = Number(url.searchParams.get('offset'));
    if (path !== 'disk:/')
      return route.fulfill({ json: { folders: [], nextOffset: null } });
    offsets.push(offset);
    if (offset === 100) await pending;
    return route.fulfill({
      json: {
        folders:
          offset === 200 ? [{ name: 'Отпуск', path: 'disk:/Отпуск' }] : [],
        nextOffset: offset < 200 ? offset + 100 : null,
      },
    });
  });
  await page
    .getByRole('button', { name: 'Новая поездка', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Выбрать папку Яндекс Диска' })
    .click();
  await expect(
    page.getByText('На этой странице подпапок нет. Продолжите поиск.'),
  ).toBeVisible();
  const search = page.getByRole('button', {
    name: 'Поискать ещё',
    exact: true,
  });
  await search.click();
  await expect(search).toBeDisabled();
  await expect(search.locator('svg')).toHaveClass('is-searching');
  release();
  await expect(
    page.getByRole('button', { name: 'Отпуск', exact: true }),
  ).toBeVisible();
  expect(offsets).toEqual([0, 100, 200]);
  await expect(
    page.getByRole('status').filter({ hasText: 'Подпапки найдены.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Отпуск', exact: true }).click();
  await search.click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Подпапок не найдено.' }),
  ).toBeVisible();
  await expect(search).toBeEnabled();
  const emptyPadding = await page
    .locator('.folder-list')
    .evaluate((el) => Number.parseFloat(getComputedStyle(el).paddingTop));
  expect(emptyPadding).toBeGreaterThanOrEqual(6);
  await page.setViewportSize({ width: 390, height: 700 });
  const layout = await page.locator('dialog.modal').evaluate((dialog) => {
    const body = dialog.querySelector('.modal-body')!;
    const head = dialog.querySelector('.modal-head')!;
    const top = head.getBoundingClientRect().top;
    body.scrollTop = body.scrollHeight;
    return {
      outerOverflow: getComputedStyle(dialog).overflowY,
      innerOverflow: getComputedStyle(body).overflowY,
      scrolls: body.scrollHeight > body.clientHeight,
      headerTop: head.getBoundingClientRect().top,
      top,
      bodyBottom: body.getBoundingClientRect().bottom,
      dialogBottom: dialog.getBoundingClientRect().bottom,
    };
  });
  expect(layout.outerOverflow).toBe('hidden');
  expect(layout.innerOverflow).toBe('auto');
  expect(layout.scrolls).toBe(true);
  expect(layout.headerTop).toBe(layout.top);
  expect(layout.bodyBottom).toBeLessThan(layout.dialogBottom);
  const link = page.locator('a[href^="/api/auth/yandex?intent=link"]').first();
  if (await link.count()) {
    await link.hover();
    await expect(link).toHaveCSS('text-decoration-line', 'none');
  }
  await page.locator('.modal-body').evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.screenshot({ path: 'test-results/folder-search-mobile.png' });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Новая поездка', exact: true }),
  ).toBeFocused();
});

test('создание поездки: одиночный тап снаружи сохраняет форму, двойной закрывает', async ({
  page,
  browser,
}) => {
  await register(page);
  await page.clock.install();
  const open = () =>
    page.getByRole('button', { name: 'Новая поездка', exact: true }).click();
  const dialog = page.getByRole('dialog', {
    name: 'Новое путешествие',
    exact: true,
  });
  await open();
  await page.getByLabel('Название поездки').fill('Сохранить черновик');
  await page.mouse.click(8, 8);
  await expect(dialog).toBeVisible();
  await expect(page.getByLabel('Название поездки')).toHaveValue(
    'Сохранить черновик',
  );
  await page.clock.fastForward(800);
  await page.mouse.click(8, 8);
  await expect(dialog).toBeVisible();
  // Editing inside resets the pending first outside click.
  await page.getByLabel('Название поездки').fill('Продолжаю редактировать');
  await page.mouse.click(8, 8);
  await expect(dialog).toBeVisible();
  await page.mouse.click(8, 8);
  await expect(dialog).toHaveCount(0);
  await open();
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await open();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  const mobile = await browser.newContext({
    storageState: await page.context().storageState(),
    hasTouch: true,
    viewport: { width: 390, height: 844 },
  });
  try {
    const touch = await mobile.newPage();
    await touch.goto('/');
    await touch
      .getByRole('button', { name: 'Новая поездка', exact: true })
      .click();
    await touch.touchscreen.tap(4, 4);
    await expect(touch.getByRole('dialog')).toBeVisible();
    await touch.touchscreen.tap(4, 4);
    await expect(touch.getByRole('dialog')).toHaveCount(0);
  } finally {
    await mobile.close();
  }
});

test('язык маршрута и стран переключается без повторного анализа и не меняет ручной текст', async ({
  page,
}) => {
  await register(page);
  await mockAccounts(page);
  let requests = 0;
  await page.route('**/api/trips/infer', (route) => {
    requests++;
    expect(route.request().postDataJSON().language).toBe('ru');
    return route.fulfill({
      json: {
        photoCount: 2,
        datedCount: 2,
        gpsCount: 2,
        start: null,
        end: null,
        destination: 'Antalya · Турция',
        route: [
          {
            name: 'Antalya',
            country: 'TR',
            distanceKm: 0,
            names: { ru: 'Анталья', en: 'Antalya' },
          },
        ],
        warnings: {},
      },
    });
  });
  await page
    .getByRole('button', { name: 'Новая поездка', exact: true })
    .click();
  await folder(page);
  await page
    .getByRole('checkbox', { name: 'Определить место по фото', exact: true })
    .check();
  await expect(
    page.getByRole('list', { name: 'Выбранные города' }),
  ).toContainText('Анталья');
  await expect(
    page.getByRole('list', { name: 'Выбранные страны' }),
  ).toContainText('Турция');
  // The toolbar is behind the native dialog. Dispatch its normal language action to verify a live locale update.
  await page.locator('.appearance-button').first().dispatchEvent('click');
  await expect(
    page.getByRole('list', { name: 'Selected cities' }),
  ).toContainText('Antalya');
  expect(requests).toBe(1);
  for (const list of ['Selected cities', 'Selected countries']) {
    const buttons = page.getByRole('list', { name: list }).getByRole('button');
    while (await buttons.count()) await buttons.first().click();
  }
  await page.getByLabel('Route', { exact: true }).fill('My own route');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.locator('.appearance-button').first().dispatchEvent('click');
  await expect(
    page.getByRole('list', { name: 'Выбранные маршруты' }),
  ).toContainText('My own route');
  expect(requests).toBe(1);
});

test('подключённая папка: галерея ждёт синхронизацию и автоматически показывает кадры', async ({
  page,
}) => {
  await register(page);
  const response = await page.request.post('/api/trips', {
    headers: { origin: 'http://127.0.0.1:3101' },
    data: {
      title: 'Автоимпорт',
      destination: 'Турция',
      start: '2026-10-10',
      end: '2026-10-18',
    },
  });
  expect(response.ok()).toBe(true);
  const trip = await response.json();
  let reads = 0;
  let failed = false;
  let complete = false;
  await page.route('**/api/trips/' + trip.id, async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    reads++;
    data.importStatus = {
      sourceCount: 1,
      waiting: !failed && !complete,
      syncing: false,
      failed,
      pendingApproval: false,
      disconnected: false,
      lastSync: reads > 1 ? Date.now() : 0,
    };
    data.media =
      failed || !complete
        ? []
        : [
            {
              id: 'arrived',
              name: 'arrived.jpg',
              kind: 'photo',
              mime: 'image/jpeg',
              taken: '2026-10-10',
              user_id: data.trip.owner_id,
              author: 'Фото',
              hidden: 0,
              lat: null,
              lon: null,
            },
          ];
    await route.fulfill({ json: data });
  });
  await page.goto('/?trip=' + trip.id);
  await expect(
    page.getByRole('heading', { name: 'Собираем фотографии поездки' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Подключить папку', exact: true }),
  ).toHaveCount(0);
  complete = true;
  await expect(page.locator('.photo-card')).toHaveCount(1, { timeout: 10000 });
  await expect(
    page.getByRole('heading', { name: 'Собираем фотографии поездки' }),
  ).toHaveCount(0);
  failed = true;
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Не удалось синхронизировать папку' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Подключить папку', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Проверить синхронизацию', exact: true }),
  ).toBeVisible();
});
