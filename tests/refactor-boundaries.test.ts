import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import { sourceMessageKeys } from '../lib/migrations/004-source-message-keys';
import { hasCoordinates } from '../lib/geo';
import { withMessageTranslations, storeMessage } from '../lib/i18n/messages';

test('stored application errors migrate once without touching provider errors or source data', () => {
  const db = new Database(':memory:');
  try {
    db.exec('CREATE TABLE sources(id TEXT PRIMARY KEY,error TEXT,path TEXT)');
    const insert = db.prepare('INSERT INTO sources VALUES (?,?,?)');
    insert.run('known', 'Нет доступа', 'disk:/My photos');
    insert.run('provider', 'Provider said: request failed', 'disk:/Other');
    insert.run('clean', null, 'disk:/Untouched');
    sourceMessageKeys(db);
    const first = db.prepare('SELECT * FROM sources ORDER BY id').all();
    sourceMessageKeys(db);
    assert.deepEqual(
      db.prepare('SELECT * FROM sources ORDER BY id').all(),
      first,
    );
    const known = db
      .prepare('SELECT * FROM sources WHERE id=?')
      .get('known') as { error: string; path: string };
    assert.notEqual(known.error, 'Нет доступа');
    assert.equal(known.path, 'disk:/My photos');
    assert.equal(
      (
        db.prepare('SELECT error FROM sources WHERE id=?').get('provider') as {
          error: string;
        }
      ).error,
      'Provider said: request failed',
    );
    assert.equal(
      (
        db.prepare('SELECT error FROM sources WHERE id=?').get('clean') as {
          error: null;
        }
      ).error,
      null,
    );
  } finally {
    db.close();
  }
});

test('coordinate guard excludes missing and non-finite points', () => {
  assert.ok(hasCoordinates({ lat: 0, lon: 0 }));
  for (const point of [
    { lat: null, lon: 1 },
    { lat: 1, lon: null },
    { lat: NaN, lon: 1 },
    { lat: 1, lon: Infinity },
  ])
    assert.equal(hasCoordinates(point), false);
});

test('plain text is never guessed as an application translation', () => {
  const text = 'Неверный email, никнейм или пароль';
  assert.deepEqual(withMessageTranslations({ error: text }), { error: text });
  const translated = withMessageTranslations({
    error: { key: 'validation.minLength', params: { count: 12 } },
  }) as { error: string; errorTranslation: unknown };
  assert.equal(translated.error, 'Минимум 12 символов');
  assert.deepEqual(translated.errorTranslation, {
    key: 'validation.minLength',
    params: { count: 12 },
  });
});

test('stored parameterized errors retain locale metadata and malformed stored text is preserved', () => {
  const message = {
    key: 'errors.yandexUnavailable' as const,
    params: { status: 503 },
  };
  const result = withMessageTranslations({
    sources: [
      { id: 's', error: storeMessage(message) },
      { id: 'bad', error: 'qk:message:invalid' },
    ],
  }) as { sources: { error: string; errorTranslation?: unknown }[] };
  assert.deepEqual(result.sources[0].errorTranslation, message);
  assert.match(result.sources[0].error, /503/);
  assert.equal(result.sources[1].error, 'qk:message:invalid');
});
