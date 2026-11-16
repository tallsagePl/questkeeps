import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

const password = 'TravelPassword123';

async function signInFixture(page: Page, baseURL: string) {
  const response = await page.request.post('/api/auth/register', {
    headers: { origin: new URL(baseURL).origin },
    data: { email: randomUUID() + '@example.test', name: 'Яндекс', password },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()).user.username as string;
}

test('a new traveler chooses a username and continues to trip creation on mobile', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/?create=1&mode=register');
  const name = page.getByLabel('Как вас зовут', { exact: true });
  const handle = page.getByLabel('Никнейм (необязательно)', { exact: true });
  await name.fill('Путешественник');
  await handle.fill('@неподходит');
  await page
    .getByLabel('Электронная почта', { exact: true })
    .fill(randomUUID() + '@example.test');
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByLabel('Повторите пароль', { exact: true }).fill(password);
  const createAccount = page.getByRole('button', {
    name: 'Создать аккаунт',
    exact: true,
  });
  await createAccount.click();
  await expect(handle).toHaveAttribute('aria-invalid', 'true');
  const username = 'route_' + randomUUID().slice(0, 8);
  await handle.fill('@' + username.toUpperCase());
  await createAccount.click();
  await expect(
    page.getByRole('dialog', { name: 'Новое путешествие' }),
  ).toBeVisible();
  expect((await (await page.request.get('/api/me')).json()).user.username).toBe(
    username,
  );
});

test('first Yandex sign-in preserves the chooser on a retry and continues to the trip after saving', async ({
  page,
  baseURL,
}) => {
  await signInFixture(page, baseURL!);
  let fail = true;
  await page.route(/\/api\/trips$/, (route) =>
    fail
      ? route.fulfill({ status: 503, json: { error: 'Fixture unavailable' } })
      : route.continue(),
  );
  await page.goto('/?create=1#signup-confirmed');
  await expect(
    page.getByRole('heading', { name: 'Не удалось открыть архив' }),
  ).toBeVisible();
  await expect(page).toHaveURL(/#signup-confirmed$/);
  fail = false;
  await page.getByRole('button', { name: 'Повторить', exact: true }).click();
  const choose = page.getByRole('dialog', { name: 'Выберите @никнейм' });
  await expect(choose).toBeVisible();
  await expect(
    page.getByRole('dialog', { name: 'Новое путешествие' }),
  ).toHaveCount(0);
  const username = 'oauth_' + randomUUID().slice(0, 8);
  await choose.getByLabel('Никнейм', { exact: true }).fill('@' + username);
  await choose.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'Новое путешествие' }),
  ).toBeVisible();
  expect((await (await page.request.get('/api/me')).json()).user.username).toBe(
    username,
  );
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Ваши путешествия.' }),
  ).toBeVisible();
  await expect(choose).toHaveCount(0);
});

test('Escape keeps the suggested Yandex username and returns to the invitation', async ({
  page,
  baseURL,
}) => {
  const username = await signInFixture(page, baseURL!);
  await page.route('**/api/invites/signup-fixture', (route) =>
    route.fulfill({
      json: {
        title: 'Поездка у моря',
        destination: 'Сочи',
        start: '2026-11-10',
        end: '2026-11-12',
        allPhotos: true,
      },
    }),
  );
  await page.goto('/join/signup-fixture#signup-confirmed');
  const choose = page.getByRole('dialog', { name: 'Выберите @никнейм' });
  await expect(choose.getByLabel('Никнейм', { exact: true })).toHaveValue(
    '@' + username,
  );
  await page.keyboard.press('Escape');
  await expect(choose).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Присоединиться', exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL('/join/signup-fixture');
});
