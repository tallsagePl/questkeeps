import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { placeTextContent } from '../lib/place-text';
process.env.DATABASE_PATH = './data/place-text-' + randomUUID() + '.sqlite';
const { db } = await import('../lib/db');
const { placeSummary, placeText } = await import('../lib/places');
const originalFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = originalFetch;
  db.close();
});
test('полный текст сохраняется, краткое описание не обрывается на сокращениях внутри скобок', async () => {
  const extract =
    'Галата (тур. Galata, итал. Galata) — исторический район города. Здесь сохранились старые здания.\n\n' +
    'Дополнительная история района. '.repeat(150);
  const text = placeTextContent(extract);
  assert.equal(text.summary, extract.trim());
  assert.equal(text.description, 'Галата — исторический район города.');
  let calls = 0;
  globalThis.fetch = async (input) => {
    calls++;
    const url = new URL(String(input));
    assert.equal(url.searchParams.has('exsentences'), false);
    return Response.json({
      query: {
        pages: {
          123: {
            title: 'Галата',
            extract,
            coordinates: [{ lat: 41, lon: 44 }],
          },
        },
      },
    });
  };
  const saved = await placeSummary(123, { lat: 41, lon: 44 });
  assert.equal(saved.summary, extract.trim());
  assert.ok(saved.summary.length > 3000);
  const cached = await placeText(123);
  assert.equal(cached.summary, extract.trim());
  assert.equal(calls, 1);
});

test('Топкапы: завершённое определение без переводов; старый обрывок не выдаётся за описание', () => {
  const complete =
    'Топкапы́ или Топкапи́ (тур. Topkapı «Пушечные ворота»), устар. «Сераль» (фр. Serail) — главный дворец Османской империи до середины XIX века. Расположен в Стамбуле.';
  assert.equal(
    placeTextContent(complete).description,
    'Топкапы — главный дворец Османской империи до середины XIX века.',
  );
  assert.equal(
    placeTextContent('Топкапы́ (тур. Topkapı, устар. Сераль (фр. Serail ← тур.')
      .description,
    '',
  );
  assert.equal(
    placeTextContent(complete, 'дворец в Стамбуле').description,
    'дворец в Стамбуле',
  );
});
