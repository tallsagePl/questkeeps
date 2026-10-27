#!/usr/bin/env python3
"""Switch only the reviewed 8/9 compatibility marker; never remove user data."""
import sqlite3
import sys
import time

path, target = sys.argv[1], int(sys.argv[2])
if target not in (8, 9):
    raise SystemExit('Only the additive media archive migration is supported')
with sqlite3.connect(path, timeout=10) as db:
    db.execute('BEGIN IMMEDIATE')
    current = db.execute('PRAGMA user_version').fetchone()[0]
    if current not in (8, 9):
        raise RuntimeError('Unexpected schema version')
    columns = {row[1] for row in db.execute('PRAGMA table_info(media)')}
    exclusions = {row[1] for row in db.execute('PRAGMA table_info(media_exclusions)')}
    if 'rotation' not in columns or exclusions != {'trip_id', 'user_id', 'resource_id', 'created'}:
        raise RuntimeError('Expected additive archive schema is missing')
    if not db.execute("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name='prevent_excluded_media_insert'").fetchone():
        raise RuntimeError('Exclusion trigger is missing')
    history = db.execute('SELECT name FROM schema_migrations WHERE version=9').fetchone()
    if history is not None and history[0] != 'media-archive':
        raise RuntimeError('Unexpected migration history')
    if target == 8:
        db.execute('DELETE FROM schema_migrations WHERE version=9')
    else:
        db.execute('INSERT OR IGNORE INTO schema_migrations VALUES (9,?,?)', ('media-archive', int(time.time()*1000)))
    db.execute('PRAGMA user_version = ' + str(target))
print('Compatible media archive schema marker:', target)
