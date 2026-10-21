import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
process.env.DATABASE_PATH = './data/migration-' + randomUUID() + '.sqlite';
const old = new Database(process.env.DATABASE_PATH);
old.exec(
  "CREATE TABLE trips(id TEXT PRIMARY KEY); CREATE TABLE media(id TEXT PRIMARY KEY,trip_id TEXT,taken TEXT); INSERT INTO trips VALUES ('trip'); INSERT INTO media VALUES ('photo','trip','2026-10-11'); CREATE TABLE places(id TEXT PRIMARY KEY,trip_id TEXT,media_id TEXT,title TEXT,summary TEXT,url TEXT,lat REAL,lon REAL,day TEXT,UNIQUE(trip_id,media_id)); INSERT INTO places VALUES ('legacy','trip','photo','Existing place','Existing summary','https://ru.wikipedia.org/?curid=1',40,20,'2026-10-11');",
);
old.close();
const { db, one, run } = await import('../lib/db');
test('переход к нескольким местам сохраняет исходные записи и таблицу', () => {
  try {
    assert.equal(
      one('SELECT title FROM confirmed_places WHERE id=?', 'legacy')!.title,
      'Existing place',
    );
    assert.equal(
      one('SELECT summary FROM places WHERE id=?', 'legacy')!.summary,
      'Existing summary',
    );
    run(
      'INSERT INTO confirmed_places VALUES (?,?,?,?,?,?,?,?,?,?)',
      'second',
      'trip',
      'photo',
      'Another place',
      'Summary',
      'https://ru.wikipedia.org/?curid=2',
      40,
      20,
      '2026-10-11',
      11,
    );
    assert.equal(one('SELECT count(*) n FROM confirmed_places')!.n, 2);
    assert.equal(one('SELECT count(*) n FROM places')!.n, 1);
  } finally {
    db.close();
  }
});
