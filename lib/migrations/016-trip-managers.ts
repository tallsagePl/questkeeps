import type Database from 'better-sqlite3';

export function tripManagers(db: Database.Database) {
  const columns = db.prepare('PRAGMA table_info(members)').all() as {
    name: string;
  }[];
  if (!columns.some(({ name }) => name === 'can_manage'))
    db.exec(
      'ALTER TABLE members ADD COLUMN can_manage INTEGER NOT NULL DEFAULT 0 CHECK(can_manage IN (0, 1))',
    );
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS revoke_inactive_trip_manager
    AFTER UPDATE OF active ON members
    WHEN NEW.active = 0 AND NEW.can_manage = 1
    BEGIN
      UPDATE members SET can_manage = 0
      WHERE trip_id = NEW.trip_id AND user_id = NEW.user_id;
    END
  `);
}
