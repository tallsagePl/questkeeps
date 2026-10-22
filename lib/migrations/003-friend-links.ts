import type Database from 'better-sqlite3';

export function friendLinks(db: Database.Database) {
  db.exec(
    'CREATE TABLE friend_links (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,hash TEXT NOT NULL UNIQUE,expires INTEGER NOT NULL)',
  );
}
