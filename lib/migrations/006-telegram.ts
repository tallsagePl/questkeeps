import type Database from 'better-sqlite3';

export function telegram(db: Database.Database) {
  db.exec(`
    CREATE TABLE telegram_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE telegram_feedback (
      id TEXT PRIMARY KEY, sender_hash TEXT NOT NULL, payload TEXT NOT NULL, created INTEGER NOT NULL
    );
    CREATE INDEX telegram_feedback_created ON telegram_feedback(created);
    CREATE TABLE telegram_outbox (
      id TEXT PRIMARY KEY, payload TEXT NOT NULL, feedback_id TEXT,
      available INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
      lease_until INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE telegram_feedback_messages (
      feedback_id TEXT NOT NULL REFERENCES telegram_feedback(id) ON DELETE CASCADE,
      message_id INTEGER NOT NULL, PRIMARY KEY(feedback_id,message_id)
    );
  `);
}
