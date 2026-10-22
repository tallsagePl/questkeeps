import type Database from 'better-sqlite3';
import { createHash } from 'node:crypto';

export function baseline(db: Database.Database) {
  db.exec(
    'CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE, name TEXT NOT NULL, password TEXT, created INTEGER NOT NULL);' +
      'CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);' +
      "CREATE TABLE IF NOT EXISTS trips (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), title TEXT NOT NULL, destination TEXT NOT NULL, start TEXT NOT NULL, end TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', share_hash TEXT UNIQUE, created INTEGER NOT NULL);" +
      'CREATE TABLE IF NOT EXISTS members (trip_id TEXT REFERENCES trips(id), user_id TEXT REFERENCES users(id), start TEXT NOT NULL, end TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, PRIMARY KEY(trip_id,user_id));' +
      'CREATE TABLE IF NOT EXISTS invites (hash TEXT PRIMARY KEY, trip_id TEXT REFERENCES trips(id), start TEXT NOT NULL, end TEXT NOT NULL, expires INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0);' +
      'CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id), yandex_id TEXT NOT NULL UNIQUE, label TEXT NOT NULL, token TEXT NOT NULL, refresh TEXT, expires INTEGER, disk_enabled INTEGER NOT NULL DEFAULT 0);' +
      'CREATE TABLE IF NOT EXISTS sources (id TEXT PRIMARY KEY, trip_id TEXT REFERENCES trips(id), user_id TEXT REFERENCES users(id), account_id TEXT REFERENCES accounts(id), path TEXT NOT NULL, approved INTEGER NOT NULL DEFAULT 0, last_sync INTEGER, error TEXT, lock_until INTEGER NOT NULL DEFAULT 0, lock_id TEXT, UNIQUE(trip_id,account_id,path));' +
      'CREATE TABLE IF NOT EXISTS media (id TEXT PRIMARY KEY, source_id TEXT REFERENCES sources(id), trip_id TEXT REFERENCES trips(id), user_id TEXT REFERENCES users(id), resource_id TEXT NOT NULL, path TEXT NOT NULL, name TEXT NOT NULL, mime TEXT NOT NULL, kind TEXT NOT NULL, taken TEXT NOT NULL, date_basis TEXT NOT NULL, lat REAL, lon REAL, hidden INTEGER NOT NULL DEFAULT 0, missing INTEGER NOT NULL DEFAULT 0, revision TEXT, UNIQUE(source_id,resource_id));' +
      'CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, trip_id TEXT REFERENCES trips(id), user_id TEXT REFERENCES users(id), day TEXT NOT NULL, text TEXT NOT NULL);' +
      'CREATE TABLE IF NOT EXISTS places (id TEXT PRIMARY KEY, trip_id TEXT REFERENCES trips(id), media_id TEXT REFERENCES media(id), title TEXT NOT NULL, summary TEXT NOT NULL, url TEXT NOT NULL, lat REAL NOT NULL, lon REAL NOT NULL, day TEXT NOT NULL, UNIQUE(trip_id,media_id));' +
      "CREATE TABLE IF NOT EXISTS oauth_states (hash TEXT PRIMARY KEY, browser_hash TEXT NOT NULL, user_id TEXT, intent TEXT NOT NULL, verifier TEXT NOT NULL, expires INTEGER NOT NULL, return_path TEXT NOT NULL DEFAULT '/');" +
      'CREATE TABLE IF NOT EXISTS throttle (key TEXT PRIMARY KEY, count INTEGER NOT NULL, until INTEGER NOT NULL);' +
      'CREATE INDEX IF NOT EXISTS media_trip_date ON media(trip_id,taken);',
  );
  // Add multi-place storage while retaining the entire original table unchanged.
  if (
    !db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='confirmed_places'",
      )
      .get()
  ) {
    db.exec(
      'CREATE TABLE confirmed_places (id TEXT PRIMARY KEY, trip_id TEXT REFERENCES trips(id), media_id TEXT REFERENCES media(id), title TEXT NOT NULL, summary TEXT NOT NULL, url TEXT NOT NULL, lat REAL NOT NULL, lon REAL NOT NULL, day TEXT NOT NULL, distance REAL, UNIQUE(trip_id,media_id,url)); INSERT INTO confirmed_places SELECT *,NULL FROM places;',
    );
  }
  const oauthColumns = db.pragma('table_info(oauth_states)') as {
    name: string;
  }[];
  if (!oauthColumns.some((c) => c.name === 'return_path'))
    db.exec(
      "ALTER TABLE oauth_states ADD COLUMN return_path TEXT NOT NULL DEFAULT '/'",
    );
  db.exec(
    'CREATE TABLE IF NOT EXISTS user_avatars (user_id TEXT PRIMARY KEY REFERENCES users(id), image BLOB NOT NULL, version TEXT NOT NULL)',
  );
  db.exec(
    'CREATE TABLE IF NOT EXISTS media_favorites (user_id TEXT NOT NULL REFERENCES users(id), media_id TEXT NOT NULL REFERENCES media(id), PRIMARY KEY(user_id,media_id)); CREATE TABLE IF NOT EXISTS media_titles (media_id TEXT PRIMARY KEY REFERENCES media(id), title TEXT NOT NULL);',
  );
  db.exec(
    'CREATE TABLE IF NOT EXISTS note_replies (id TEXT PRIMARY KEY, note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE, parent_id TEXT REFERENCES note_replies(id), user_id TEXT NOT NULL REFERENCES users(id), text TEXT NOT NULL, created INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0); CREATE INDEX IF NOT EXISTS note_replies_note ON note_replies(note_id,created);',
  );
  db.exec(
    'CREATE TABLE IF NOT EXISTS place_geometry_cache (page_id INTEGER PRIMARY KEY, json TEXT NOT NULL, updated INTEGER NOT NULL)',
  );
  db.exec(
    'CREATE TABLE IF NOT EXISTS map_areas (id TEXT PRIMARY KEY,title TEXT NOT NULL,kind TEXT NOT NULL,summary TEXT NOT NULL,url TEXT NOT NULL,lat REAL NOT NULL,lon REAL NOT NULL,geometry TEXT NOT NULL,updated INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS trip_area_candidates (trip_id TEXT NOT NULL REFERENCES trips(id),area_id TEXT NOT NULL REFERENCES map_areas(id),PRIMARY KEY(trip_id,area_id));',
  );
  db.exec(
    'CREATE TABLE IF NOT EXISTS map_area_city_cache (key TEXT PRIMARY KEY,json TEXT NOT NULL,updated INTEGER NOT NULL)',
  );
  db.exec(
    'CREATE TABLE IF NOT EXISTS map_area_wiki (area_id TEXT PRIMARY KEY REFERENCES map_areas(id),json TEXT NOT NULL,updated INTEGER NOT NULL)',
  );
  db.exec(
    'CREATE TABLE IF NOT EXISTS user_handles (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,username TEXT NOT NULL UNIQUE COLLATE NOCASE); CREATE TABLE IF NOT EXISTS trip_description_mentions (trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,start INTEGER NOT NULL,end INTEGER NOT NULL,user_id TEXT NOT NULL REFERENCES users(id),PRIMARY KEY(trip_id,start));',
  );
  for (const user of db
    .prepare(
      'SELECT id,name FROM users WHERE id NOT IN (SELECT user_id FROM user_handles)',
    )
    .all() as { id: string; name: string }[]) {
    let base = user.name
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '')
      .slice(0, 24);
    if (base.length < 3)
      base =
        'user_' +
        createHash('sha256').update(user.id).digest('hex').slice(0, 8);
    let username = base;
    let suffix = 1;
    while (
      db.prepare('SELECT 1 FROM user_handles WHERE username=?').get(username)
    )
      username = base + '_' + suffix++;
    db.prepare('INSERT INTO user_handles VALUES (?,?)').run(user.id, username);
  }
  db.exec(
    'CREATE TABLE IF NOT EXISTS map_area_wiki_i18n (area_id TEXT NOT NULL REFERENCES map_areas(id),language TEXT NOT NULL,json TEXT NOT NULL,updated INTEGER NOT NULL,PRIMARY KEY(area_id,language))',
  );
  db.exec(
    "CREATE TABLE IF NOT EXISTS friendships (user_a TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,user_b TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,requested_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,status TEXT NOT NULL CHECK(status IN ('pending','accepted')),created INTEGER NOT NULL,PRIMARY KEY(user_a,user_b),CHECK(user_a < user_b),CHECK(requested_by=user_a OR requested_by=user_b)); CREATE INDEX IF NOT EXISTS friendships_recipient ON friendships(user_b,status);",
  );
  db.exec(
    'CREATE INDEX IF NOT EXISTS media_author_trip_date ON media(user_id,trip_id,taken DESC,id DESC)',
  );
  db.exec(
    'CREATE TABLE IF NOT EXISTS exif_cache (key TEXT PRIMARY KEY,json TEXT NOT NULL,updated INTEGER NOT NULL)',
  );
}
