import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
process.env.DATABASE_PATH = './data/wiki-locale-' + randomUUID() + '.sqlite';
const { localizedWikiArticle } = await import('../lib/wiki-article');
const { db } = await import('../lib/db');
after(() => db.close());
test('article locale selects exact interlanguage pages, separates cache entries and never substitutes Russian for missing English', async () => {
  const original = globalThis.fetch,
    calls: string[] = [];
  globalThis.fetch = async (input: any) => {
    const url = new URL(String(input));
    calls.push(url.href);
    const english = url.hostname === 'en.wikipedia.org',
      id = Number(url.searchParams.get('pageids') || (english ? 110 : 10));
    const missingEnglish = id === 40;
    return Response.json({
      query: {
        pages: {
          [id]: {
            pageid: id,
            title: english
              ? 'English landmark'
              : 'Русская достопримечательность',
            extract: english
              ? 'An English description of the landmark.'
              : 'Русское описание достопримечательности.',
            langlinks: missingEnglish
              ? []
              : [
                  {
                    lang: english ? 'ru' : 'en',
                    '*': english
                      ? 'Русская достопримечательность'
                      : 'English landmark',
                  },
                ],
            pageprops: {},
          },
        },
      },
    });
  };
  try {
    const ru = await localizedWikiArticle(10, 'ru');
    assert.equal(ru.title, 'Русская достопримечательность');
    assert.equal(ru.language, 'ru');
    const en = await localizedWikiArticle(10, 'en');
    assert.equal(en.title, 'English landmark');
    assert.equal(en.description, 'An English description of the landmark.');
    assert.match(en.url!, /^https:\/\/en[.]wikipedia[.]org/);
    const before = calls.length;
    assert.deepEqual(await localizedWikiArticle(10, 'ru'), ru);
    assert.equal(calls.length, before);
    const fallback = await localizedWikiArticle(110, 'ru', 'en');
    assert.equal(fallback.language, 'ru');
    const unavailable = await localizedWikiArticle(40, 'en');
    assert.equal(unavailable.available, false);
    assert.equal(unavailable.url, null);
    assert.doesNotMatch(unavailable.description, /[А-Яа-я]/);
  } finally {
    globalThis.fetch = original;
  }
});
