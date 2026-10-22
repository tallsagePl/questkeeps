import { test, expect, type BrowserContext } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const base = 'http://127.0.0.1:3101';

test('дневник: ответы лесенкой, сворачивание, права автора, гости и мобильный экран', async ({
  page,
  browser,
}) => {
  const owner = page.context();
  const member = await browser.newContext();
  const guest = await browser.newContext();
  const post = async (context: BrowserContext, path: string, data: unknown) => {
    const r = await context.request.post(base + '/api/' + path, {
      headers: { origin: base },
      data,
    });
    expect(r.ok()).toBe(true);
    return r.json();
  };
  try {
    for (const [context, name] of [
      [owner, 'Автор истории'],
      [member, 'Другой участник'],
    ] as const)
      await post(context, 'auth/register', {
        email: 'thread-' + name.length + '-' + Date.now() + '@example.test',
        password: 'ThreadPassword123',
        name,
      });
    const { id: tid } = await post(owner, 'trips', {
      title: 'Разговоры в пути',
      destination: 'Стамбул',
      start: '2026-10-10',
      end: '2026-10-18',
    });
    await post(owner, 'trips/' + tid + '/notes', {
      day: '2026-10-13',
      text: 'Весь день гуляли по старому городу.',
    });
    const invite = await post(owner, 'trips/' + tid + '/invite', {
      start: '2026-10-12',
      end: '2026-10-14',
    });
    await post(member, 'invites/' + invite.url.split('/').at(-1), {});
    const memberPage = await member.newPage();
    await memberPage.goto(base + '/?trip=' + tid);
    await memberPage
      .getByRole('button', { name: 'Дневник', exact: true })
      .click();
    const memberThread = memberPage.locator('.note-thread');
    await expect(
      memberThread.getByRole('button', { name: 'Удалить запись', exact: true }),
    ).toHaveCount(0);
    await memberThread
      .getByRole('button', { name: 'Ответить', exact: true })
      .click();
    await memberThread
      .getByLabel('Ответ для Автор истории', { exact: true })
      .fill('А вечером нашли отличное кафе!');
    await memberThread
      .getByRole('button', { name: 'Отправить ответ', exact: true })
      .click();
    await expect(
      memberThread.getByText('А вечером нашли отличное кафе!', { exact: true }),
    ).toBeVisible();
    await expect(
      memberThread
        .locator('.note-reply')
        .first()
        .getByRole('button', { name: 'Ответить', exact: true }),
    ).toHaveCount(0);
    await page.goto(base + '/?trip=' + tid);
    await page.getByRole('button', { name: 'Дневник', exact: true }).click();
    const thread = page.locator('.note-thread');
    await expect(
      thread
        .locator(':scope > .note-actions')
        .getByRole('button', { name: 'Ответить', exact: true }),
    ).toHaveCount(0);
    await thread
      .getByRole('button', { name: 'Показать ответы (1)', exact: true })
      .click();
    await thread
      .locator('.note-reply')
      .first()
      .getByRole('button', { name: 'Ответить', exact: true })
      .click();
    await thread
      .getByLabel('Ответ для Другой участник', { exact: true })
      .fill('Да, хочется вернуться туда ещё раз.');
    await thread
      .getByRole('button', { name: 'Отправить ответ', exact: true })
      .click();
    await expect(
      thread.getByText('Да, хочется вернуться туда ещё раз.', { exact: true }),
    ).toBeVisible();
    await expect(thread.locator('.note-reply')).toHaveCount(2);
    const boxes = await thread
      .locator('.note-reply')
      .evaluateAll((items) =>
        items.map((item) => item.getBoundingClientRect().x),
      );
    expect(boxes[1]).toBeGreaterThan(boxes[0]);
    const data = await (
      await owner.request.get(base + '/api/trips/' + tid)
    ).json();
    const noteId = data.notes[0].id;
    let parent = data.noteReplies.at(-1).id;
    for (let i = 0; i < 6; i++) {
      const result = await post(
        i % 2 === 0 ? member : owner,
        'trips/' + tid + '/notes/' + noteId + '/replies',
        {
          parentId: parent,
          text:
            i === 5
              ? 'ОченьДлинноеСлово'.repeat(25)
              : 'Продолжаем разговор — ответ ' + (i + 3),
        },
      );
      parent = result.reply.id;
    }
    await page.reload();
    await page.getByRole('button', { name: 'Дневник', exact: true }).click();
    await thread
      .getByRole('button', { name: 'Показать ответы (8)', exact: true })
      .click();
    await expect(thread.locator('.note-reply')).toHaveCount(8);
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    await thread.screenshot({ path: 'test-results/note-thread-wide.png' });
    await thread
      .getByRole('button', { name: 'Свернуть ответы (8)', exact: true })
      .click();
    await expect(
      thread.getByText('А вечером нашли отличное кафе!', { exact: true }),
    ).not.toBeVisible();
    await thread
      .getByRole('button', { name: 'Показать ответы (8)', exact: true })
      .click();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    await thread.screenshot({ path: 'test-results/note-thread-mobile.png' });
    expect(
      (
        await new AxeBuilder({ page })
          .include('.note-thread')
          .withTags(['wcag2a', 'wcag2aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    const share = await post(owner, 'trips/' + tid + '/share', {
      enabled: true,
    });
    const guestPage = await guest.newPage();
    await guestPage.goto(share.url);
    await guestPage
      .getByRole('button', { name: 'Дневник', exact: true })
      .click();
    await guestPage
      .getByRole('button', { name: 'Показать ответы (8)', exact: true })
      .click();
    await expect(guestPage.locator('.note-reply').first()).toBeVisible();
    await expect(
      guestPage.getByRole('button', {
        name: /^(Ответить|Удалить ответ|Удалить запись)$/,
      }),
    ).toHaveCount(0);
    await memberPage.reload();
    await memberPage
      .getByRole('button', { name: 'Дневник', exact: true })
      .click();
    await memberThread
      .getByRole('button', { name: 'Показать ответы (8)', exact: true })
      .click();
    await memberThread
      .locator('.note-reply')
      .first()
      .getByRole('button', { name: 'Удалить ответ', exact: true })
      .click();
    await expect(
      memberThread.getByText('Ответ удалён автором', { exact: true }),
    ).toBeVisible();
    await expect(
      memberThread.getByText('Да, хочется вернуться туда ещё раз.', {
        exact: true,
      }),
    ).toBeVisible();
    await thread
      .locator(':scope > .note-actions')
      .getByRole('button', { name: 'Удалить запись', exact: true })
      .click();
    await expect(
      thread.getByText('Запись удалена автором', { exact: true }),
    ).toBeVisible();
    await expect(thread.locator('.note-reply')).toHaveCount(8);
  } finally {
    await member.close();
    await guest.close();
  }
});
