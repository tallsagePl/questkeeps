import { test, expect } from '@playwright/test';

test('selected names, @ suggestions, profile usernames and short public links', async ({
  page,
  browser,
}) => {
  const suffix = Date.now().toString(36);
  const username = 'owl_' + suffix;
  const friendHandle = 'andrey_' + suffix;
  const email = 'mentions-' + suffix + '@example.test';
  const register = await page.request.post('/api/auth/register', {
    headers: { origin: 'http://127.0.0.1:3101' },
    data: { email, password: 'TravelPassword123', name: 'Сова' },
  });
  expect(register.ok()).toBeTruthy();
  const own = await page.request.patch('/api/me', {
    headers: { origin: 'http://127.0.0.1:3101' },
    data: { username },
  });
  const user = (await own.json()).user;
  const friendContext = await browser.newContext();
  await friendContext.request.post('http://127.0.0.1:3101/api/auth/register', {
    headers: { origin: 'http://127.0.0.1:3101' },
    data: {
      email: 'andrey-' + suffix + '@example.test',
      password: 'TravelPassword123',
      name: 'Андрей',
    },
  });
  const friendResponse = await friendContext.request.patch(
    'http://127.0.0.1:3101/api/me',
    {
      headers: { origin: 'http://127.0.0.1:3101' },
      data: { username: friendHandle },
    },
  );
  const friend = (await friendResponse.json()).user;
  await friendContext.close();
  const people = [user, friend];
  const trip: any = {
    id: 'mention-trip',
    title: 'Первый Стамбул',
    description: 'Первая поездка с Сашей и Андреем.',
    descriptionMentions: [],
    destination: 'Стамбул',
    start: '2026-10-10',
    end: '2026-10-18',
    from: '2026-10-10',
    to: '2026-10-18',
    role: 'owner',
    sharing: false,
  };
  await page.route('**/api/trips', (r) =>
    r.fulfill({ json: { trips: [trip] } }),
  );
  await page.route('**/api/trips/mention-trip', (r) => {
    if (r.request().method() === 'PATCH') {
      const input = r.request().postDataJSON();
      trip.description = input.description;
      trip.descriptionMentions = input.mentions.map((m: any) => {
        const person = people.find((u) => u.id === m.userId)!;
        return { ...m, name: person.name, username: person.username };
      });
      return r.fulfill({
        json: {
          description: trip.description,
          descriptionMentions: trip.descriptionMentions,
        },
      });
    }
    return r.fulfill({
      json: {
        trip,
        media: [],
        places: [],
        notes: [],
        importStatus: { sourceCount: 0 },
      },
    });
  });
  await page.goto('/?trip=mention-trip');
  const copy = page.locator('.trip-description > p');
  await expect(copy).toContainText('Первая поездка');
  await copy.locator('.trip-description-paragraph').evaluate((el) => {
    const text = el.firstChild!;
    const start = text.textContent!.indexOf('Сашей');
    const range = document.createRange();
    range.setStart(text, start);
    range.setEnd(text, start + 5);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page
    .locator('.trip-description')
    .screenshot({ path: 'test-results/description-picker-mobile.png' });
  await page.getByRole('button', { name: 'Это я', exact: true }).click();
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(
    copy.getByRole('link', { name: 'Сашей', exact: true }),
  ).toHaveAttribute('href', '/@' + username);
  await page.getByRole('button', { name: 'Изменить описание поездки' }).click();
  const editor = page.getByLabel('Описание поездки', { exact: true });
  await editor.fill('Первая поездка с Сашей и @' + friendHandle.slice(0, -1));
  await page
    .getByRole('button', { name: 'Андрей @' + friendHandle, exact: true })
    .click();
  await expect(editor).toHaveValue('Первая поездка с Сашей и @' + friendHandle);
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(
    copy.getByRole('link', { name: '@' + friendHandle, exact: true }),
  ).toHaveAttribute('href', '/@' + friendHandle);
  await expect(
    copy.getByRole('link', { name: 'Сашей', exact: true }),
  ).toHaveAttribute('href', '/@' + username);
  await page.reload();
  await expect(
    copy.getByRole('link', { name: 'Сашей', exact: true }),
  ).toBeVisible();
  await page
    .locator('.trip-description')
    .screenshot({ path: 'test-results/description-mentions.png' });
  await copy.getByRole('link', { name: 'Сашей', exact: true }).click();
  await expect(page).toHaveURL('/@' + username);
  await expect(
    page.getByRole('heading', { name: 'Сова', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('@' + username, { exact: true })).toBeVisible();
  await expect(page.getByText(email, { exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({ path: 'test-results/public-profile-mobile.png' });
  await page.goto('/?trip=mention-trip');
  await page.locator('.user-button').click();
  await page
    .getByRole('button', { name: 'Изменить юзернейм', exact: true })
    .click();
  await expect(page.getByLabel('Юзернейм', { exact: true })).toHaveValue(
    username,
  );
  const updated = 'owl_new_' + suffix;
  await page.getByLabel('Юзернейм', { exact: true }).fill(updated);
  await page
    .getByRole('button', { name: 'Сохранить юзернейм', exact: true })
    .click();
  await expect(
    page.getByRole('link', { name: '@' + updated, exact: true }),
  ).toHaveAttribute('href', '/@' + updated);
  await page
    .locator('.profile-settings')
    .screenshot({ path: 'test-results/profile-handles-mobile.png' });
  await page.goto('/@' + updated);
  await expect(
    page.getByRole('heading', { name: 'Сова', exact: true }),
  ).toBeVisible();
});
