import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('public example and creation entry render while session is pending', async ({
  page,
}) => {
  let releaseSession!: () => void;
  const pendingSession = new Promise<void>((resolve) => {
    releaseSession = resolve;
  });
  await page.route('**/api/me', async (route) => {
    await pendingSession;
    await route.fulfill({ json: { user: null, yandexEnabled: false } });
  });
  try {
    await page.goto('/');
    const example = page.locator('#trip-example');
    await expect(
      page.getByRole('link', { name: 'Создать поездку' }),
    ).toHaveAttribute('href', '/?create=1#welcome-auth');
    await expect(
      page.getByRole('link', { name: 'Посмотреть пример' }),
    ).toHaveAttribute('href', '#trip-example');
    await expect(
      example.getByText('10 мая · Вид с Галатской башни'),
    ).toBeVisible();
    await expect(
      example.getByText('11 мая · Прогулка вдоль Золотого Рога'),
    ).toBeVisible();
    await expect(
      example.getByRole('link', { name: 'Собрать свою поездку' }),
    ).toHaveAttribute('href', '/?create=1#welcome-auth');
    const gallery = example.getByRole('radio', { name: 'Галерея' });
    await gallery.focus();
    await page.keyboard.press('ArrowRight');
    await expect(example.getByRole('radio', { name: 'Карта' })).toBeChecked();
    await expect(
      example.getByText('На карте видны места съёмки в Стамбуле.'),
    ).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(example.getByRole('radio', { name: 'Дневник' })).toBeChecked();
    await expect(
      example.getByText(/В дневнике сохранились заметки/),
    ).toBeVisible();
    expect(
      (
        await new AxeBuilder({ page })
          .include('#trip-example')
          .withTags(['wcag2a', 'wcag2aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
  } finally {
    releaseSession();
  }
  await expect(page.locator('#welcome-auth input[name="email"]')).toBeVisible();
  await expect(
    page.locator('#trip-example').getByRole('radio', { name: 'Дневник' }),
  ).toBeChecked();
});

test.describe('without scripts', () => {
  test.use({ javaScriptEnabled: false });
  test('guide links to the public example and the example remains interactive', async ({
    page,
  }) => {
    await page.goto('/guide');
    await expect(
      page.getByRole('link', { name: 'Создать поездку' }),
    ).toHaveCount(2);
    await page.getByRole('link', { name: /Три дня у Босфора/ }).click();
    const example = page.locator('#trip-example');
    await expect(
      example.getByRole('heading', { name: 'Три дня у Босфора' }),
    ).toBeInViewport();
    await example.getByText('Карта', { exact: true }).click();
    await expect(
      example.getByText('На карте видны места съёмки в Стамбуле.'),
    ).toBeVisible();
  });
});
