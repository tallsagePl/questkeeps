import type Database from 'better-sqlite3';

export function photoSelfMarks(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS photo_self_marks (
      media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY(media_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS photo_self_marks_user ON photo_self_marks(user_id);
  `);
}
