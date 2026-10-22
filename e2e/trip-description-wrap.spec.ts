import { test, expect } from '@playwright/test';

test('description balances automatic lines while retaining authored breaks and one-word paragraphs', async ({
  page,
}) => {
  const description =
    'Первая поездка в Анталию и Стамбул с Сашей\nВстретились с Матасом и Машей, а также познакомились с Ваней и Ульяной\nИ не только посетили достопримечательности, а еще сделали важное дело - довезли бабушку Женю до Анталии\nОтдых';
  const trip = {
    id: 'wrap',
    title: 'Первый Стамбул',
    description,
    destination: 'Стамбул',
    start: '2026-10-10',
    end: '2026-10-18',
    from: '2026-10-10',
    to: '2026-10-18',
    role: 'owner',
    sharing: false,
  };
  await page.route('**/api/me', (r) =>
    r.fulfill({
      json: { user: { id: 'owner', name: 'Автор' }, yandexEnabled: false },
    }),
  );
  await page.route('**/api/trips', (r) =>
    r.fulfill({ json: { trips: [trip] } }),
  );
  await page.route('**/api/trips/wrap', (r) =>
    r.fulfill({
      json: {
        trip,
        media: [],
        places: [],
        notes: [],
        importStatus: { sourceCount: 0 },
      },
    }),
  );
  await page.goto('/?trip=wrap');
  const copy = page.locator('.trip-description > p');
  for (const width of [1280, 1894, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const paragraphs = await copy.evaluate((el) => {
      return [...el.querySelectorAll('.trip-description-paragraph')].map(
        (paragraph) => {
          const node = paragraph.firstChild!;
          const text = node.textContent!;
          const lines = new Map<number, string[]>();
          for (const match of text.matchAll(/\S+/g)) {
            const range = document.createRange();
            range.setStart(node, match.index!);
            range.setEnd(node, match.index! + match[0].length);
            const y = Math.round(range.getBoundingClientRect().top);
            lines.set(y, [...(lines.get(y) || []), match[0]]);
          }
          return [...lines.values()];
        },
      );
    });
    expect(paragraphs.at(-1)).toEqual([['Отдых']]);
    for (const paragraph of paragraphs.slice(0, -1))
      for (const line of paragraph) expect(line.length).toBeGreaterThan(1);
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    await copy.screenshot({
      path: 'test-results/description-wrap-' + width + '.png',
    });
  }
  await expect(copy).toContainText(description);
});
