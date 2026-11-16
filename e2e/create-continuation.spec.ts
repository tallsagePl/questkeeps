import { expect, test, type Locator } from '@playwright/test';

async function enterTripDetails(dialog: Locator) {
  await dialog.getByLabel('Название поездки').fill('Выходные в Казани');
  await dialog.getByLabel('Маршрут', { exact: true }).fill('Казань');
  await dialog.getByRole('button', { name: 'Добавить', exact: true }).click();
  await dialog.getByLabel('Начало', { exact: true }).fill('2026-10-10');
  await dialog.getByLabel('Окончание', { exact: true }).fill('2026-10-12');
}

async function expectDraft(dialog: Locator) {
  await expect(dialog.getByLabel('Название поездки')).toHaveValue(
    'Выходные в Казани',
  );
  await expect(
    dialog.getByRole('list', { name: 'Выбранные маршруты' }),
  ).toContainText('Казань');
  await expect(dialog.getByLabel('Начало', { exact: true })).toHaveValue(
    '2026-10-10',
  );
  await expect(dialog.getByLabel('Окончание', { exact: true })).toHaveValue(
    '2026-10-12',
  );
}

test('a guest fills the trip before signing up, can go back, and saves it after registration', async ({
  page,
  baseURL,
}) => {
  const origin = new URL(baseURL!).origin;
  const email = 'create-' + crypto.randomUUID() + '@fixture.invalid';
  let accountsRequestedAsGuest = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/accounts')
      accountsRequestedAsGuest++;
  });
  const auth = page.getByRole('dialog', { name: 'Сохраните путешествие' });
  const dialog = page.getByRole('dialog', { name: 'Новое путешествие' });
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/');
  await page
    .getByRole('link', { name: 'Создать поездку', exact: true })
    .click();
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('input[name="password"]')).toHaveCount(0);
  expect(accountsRequestedAsGuest).toBe(0);
  const cities = await page.request.get(
    '/api/locations?type=cities&q=Казан&language=ru',
  );
  expect(cities.ok()).toBe(true);
  expect(
    (await cities.json()).options.some(
      (item: { label: string }) => item.label === 'Казань',
    ),
  ).toBe(true);
  await enterTripDetails(dialog);
  await dialog.getByLabel('Окончание', { exact: true }).fill('2026-10-09');
  await dialog
    .getByRole('button', { name: 'Создать путешествие', exact: true })
    .click();
  await expect(dialog.getByRole('alert')).toHaveText(
    'Дата окончания должна быть не раньше начала',
  );
  await expect(auth).toHaveCount(0);
  await dialog.getByLabel('Окончание', { exact: true }).fill('2026-10-12');
  await dialog
    .getByRole('button', { name: 'Создать путешествие', exact: true })
    .click();
  await expect(auth).toBeVisible();
  await auth.getByRole('button', { name: 'Вернуться к черновику' }).click();
  await expectDraft(dialog);
  await dialog
    .getByRole('button', { name: 'Создать путешествие', exact: true })
    .click();
  await auth.getByLabel('Как вас зовут').fill('Traveller');
  await auth.getByLabel('Электронная почта', { exact: true }).fill(email);
  await auth.getByLabel('Пароль', { exact: true }).fill('Travel123');
  await auth.getByLabel('Повторите пароль').fill('Travel123');
  await auth
    .getByRole('button', { name: 'Создать аккаунт', exact: true })
    .click();
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(origin + '/');
  await expectDraft(dialog);
  await dialog
    .getByRole('button', { name: 'Создать путешествие', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Выходные в Казани.' }),
  ).toBeVisible();

  await page.context().clearCookies();
  await page.goto('/?create=1&mode=login');
  const signIn = page.locator('#welcome-auth');
  await signIn.getByLabel('Электронная почта или никнейм').fill(email);
  await signIn.getByLabel('Пароль', { exact: true }).fill('Travel123');
  await signIn.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(origin + '/');
});

for (const canceled of [false, true]) {
  test(`connecting Disk ${canceled ? 'preserves the draft on cancel' : 'signs in once and reopens the folder picker'}`, async ({
    page,
    baseURL,
  }) => {
    let authRequests = 0;
    await page.route('**/api/me', async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        json: { ...(await response.json()), yandexEnabled: true },
      });
    });
    await page.route('**/api/accounts', (route) =>
      route.fulfill({
        json: {
          accounts: [{ id: 'disk-oauth-fixture', label: 'Яндекс Диск' }],
        },
      }),
    );
    await page.route(
      '**/api/accounts/disk-oauth-fixture/folders?**',
      (route) => {
        const path = new URL(route.request().url()).searchParams.get('path');
        return route.fulfill({
          json: {
            folders:
              path === 'disk:/'
                ? [{ name: 'Снимки из Казани', path: 'disk:/Казань' }]
                : [],
            nextOffset: null,
          },
        });
      },
    );
    await page.route('**/api/auth/yandex?**', async (route) => {
      authRequests++;
      const query = new URL(route.request().url()).searchParams;
      expect(query.get('intent')).toBe('login_disk');
      expect(query.get('returnTo')).toBe('/?create=1&disk=1');
      if (!canceled) {
        const signedIn = await page.request.post('/api/auth/register', {
          headers: { origin: new URL(baseURL!).origin },
          data: {
            email: crypto.randomUUID() + '@fixture.invalid',
            name: 'Яндекс',
            password: 'Travel123',
          },
        });
        expect(signedIn.ok()).toBe(true);
      }
      await route.fulfill({
        status: 303,
        headers: {
          location: canceled
            ? '/auth/error?reason=access_denied&intent=login_disk&returnTo=%2F%3Fcreate%3D1%26disk%3D1'
            : '/?create=1&disk=1#signup-confirmed',
        },
      });
    });
    await page.goto('/?create=1');
    const dialog = page.getByRole('dialog', { name: 'Новое путешествие' });
    await enterTripDetails(dialog);
    await dialog
      .getByRole('link', { name: 'Выбрать папку Яндекс Диска' })
      .click();
    if (canceled)
      await page.getByRole('link', { name: 'Вернуться в QuestKeeps' }).click();
    await expectDraft(dialog);
    expect(authRequests).toBe(1);
    await expect(
      page.getByRole('dialog', { name: 'Выберите @никнейм' }),
    ).toHaveCount(0);
    if (canceled) {
      await expect(
        dialog.getByRole('link', { name: 'Выбрать папку Яндекс Диска' }),
      ).toBeVisible();
    } else {
      const folder = dialog.getByRole('button', { name: 'Снимки из Казани' });
      await expect(
        dialog.getByRole('region', { name: 'Фотографии' }),
      ).toBeFocused();
      await expect(folder).toBeInViewport();
      await folder.click();
      await dialog.getByRole('button', { name: 'Выбрать эту папку' }).click();
      await expect(
        dialog.getByText('Папка выбрана', { exact: true }),
      ).toBeVisible();
    }
  });
}

test('registration explains which password requirements are still missing', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/?create=1#welcome-auth');
  const auth = page.locator('#welcome-auth');
  const password = auth.getByLabel('Пароль', { exact: true });
  const error = auth
    .locator('.field')
    .filter({ has: page.locator('input[name="password"]') })
    .getByRole('alert');
  await auth.getByLabel('Как вас зовут').fill('Traveller');
  await auth
    .getByLabel('Электронная почта', { exact: true })
    .fill('test@fixture.invalid');
  await auth.getByLabel('Повторите пароль').fill('Abcdef');
  await password.fill('123123');
  await auth.getByRole('button', { name: 'Показать пароль' }).first().click();
  await auth
    .getByRole('button', { name: 'Создать аккаунт', exact: true })
    .click();
  await expect(error).toHaveText(
    'Добавьте заглавную (A–Z) и строчную (a–z) латинские буквы.',
  );
  await expect(password).toBeFocused();
  await expect(password).toHaveAccessibleDescription(
    'Добавьте заглавную (A–Z) и строчную (a–z) латинские буквы.',
  );
  await password.fill('abc123');
  await expect(error).toHaveText('Добавьте заглавную латинскую букву (A–Z).');
  await password.fill('ABC123');
  await expect(error).toHaveText('Добавьте строчную латинскую букву (a–z).');
  await password.fill('Ab1');
  await expect(error).toHaveText('Минимум 6 символов.');
  await password.fill('Abcd я');
  await expect(error).toHaveText(
    'Используйте буквы A–Z и a–z, цифры или знаки без пробелов.',
  );
  await password.fill('Abcdef');
  await expect(error).toHaveCount(0);
});

test('the verification email continues to trip creation in a fresh browser context', async ({
  page,
  browser,
  baseURL,
}) => {
  const origin = new URL(baseURL!).origin;
  const email = 'create-mail-' + crypto.randomUUID() + '@fixture.invalid';
  const registered = await page.request.post('/api/auth/register', {
    headers: { origin },
    data: { email, name: 'Email Traveller', password: 'Travel123' },
  });
  expect(registered.ok()).toBeTruthy();
  const user = (await registered.json()).user;
  const cookie = (await page.context().cookies()).find(
    (item) => item.name === 'ta_session',
  )!;
  const fresh = await browser.newContext({ baseURL: origin });
  try {
    const verification = await fresh.newPage();
    const token = 'a'.repeat(43);
    await fresh.route('**/api/auth/verify-email', (route) => {
      expect(route.request().postDataJSON()).toEqual({ token });
      return route.fulfill({
        headers: {
          'set-cookie': 'ta_session=' + cookie.value + '; Path=/; HttpOnly',
        },
        json: { verified: true, user },
      });
    });
    await verification.goto('/verify-email#token=' + token + '&create=1');
    await expect(verification).toHaveURL(origin + '/verify-email');
    await expect(
      verification.getByText(
        'После подтверждения откроется форма новой поездки.',
      ),
    ).toBeVisible();
    await verification
      .getByRole('button', { name: 'Подтвердить почту и войти' })
      .click();
    await expect(
      verification.getByRole('dialog', { name: 'Новое путешествие' }),
    ).toBeVisible();
  } finally {
    await fresh.close();
  }
});

test('password reset keeps trip intent through the request and return to sign in', async ({
  page,
  baseURL,
}) => {
  const origin = new URL(baseURL!).origin;
  await page.route('**/api/auth/forgot-password', (route) => {
    expect(route.request().postDataJSON()).toMatchObject({ createTrip: true });
    return route.fulfill({ json: { message: 'reset.sent' } });
  });
  await page.route('**/api/auth/reset-password', (route) =>
    route.fulfill({ json: { message: 'reset.done' } }),
  );
  await page.goto('/?create=1&mode=login');
  await page.getByRole('link', { name: 'Забыли пароль?' }).click();
  await expect(page).toHaveURL(origin + '/reset-password?create=1');
  await page
    .getByLabel('Электронная почта', { exact: true })
    .fill('test@fixture.invalid');
  await page
    .getByRole('button', { name: 'Отправить ссылку', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Отправить новую ссылку' }),
  ).toBeVisible();

  await page.goto('/reset-password#token=' + 'b'.repeat(43) + '&create=1');
  await expect(page).toHaveURL(origin + '/reset-password?create=1');
  await page.getByLabel('Новый пароль', { exact: true }).fill('Travel123');
  await page.getByLabel('Повторите пароль').fill('Travel123');
  await page.getByRole('button', { name: 'Сохранить новый пароль' }).click();
  await expect(page.getByText(/Пароль изменён/)).toBeVisible();
  await page.getByRole('link', { name: 'Войти и создать поездку' }).click();
  await expect(page).toHaveURL(origin + '/?create=1&mode=login');
  await expect(page.getByLabel('Электронная почта или никнейм')).toBeVisible();
});

test('the welcome sign-in link leaves pending verification and retains trip intent', async ({
  page,
}) => {
  await page.route('**/api/auth/register', (route) =>
    route.fulfill({
      json: {
        verificationRequired: true,
        verificationEmail: 'test@fixture.invalid',
        message: 'trip.verifyYourEmailUsingTheLinkIn',
      },
    }),
  );
  await page.goto('/?create=1#welcome-auth');
  const auth = page.locator('#welcome-auth');
  await auth.getByLabel('Как вас зовут').fill('Traveller');
  await auth
    .getByLabel('Электронная почта', { exact: true })
    .fill('test@fixture.invalid');
  await auth.getByLabel('Пароль', { exact: true }).fill('Travel123');
  await auth.getByLabel('Повторите пароль').fill('Travel123');
  await auth
    .getByRole('button', { name: 'Создать аккаунт', exact: true })
    .click();
  await expect(auth.getByText('test@fixture.invalid')).toBeVisible();
  await page
    .locator('main')
    .getByRole('link', { name: 'Войти', exact: true })
    .click();
  await expect(auth.getByLabel('Электронная почта или никнейм')).toBeVisible();
  await expect(auth.getByText('test@fixture.invalid')).toHaveCount(0);
  await expect(
    auth.getByRole('link', { name: 'Забыли пароль?' }),
  ).toHaveAttribute('href', '/reset-password?create=1');
});
