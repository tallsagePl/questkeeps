import type Database from 'better-sqlite3';

export function notificationState(db: Database.Database) {
  db.exec(
    'CREATE TABLE IF NOT EXISTS notification_state (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,snapshot TEXT NOT NULL,updated INTEGER NOT NULL)',
  );
}
