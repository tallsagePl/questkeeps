#!/usr/bin/env python3
"""Switch only the reviewed 8/9/10/11/12/13 compatibility marker; never remove user data."""
import sqlite3
import sys
import time

path, target = sys.argv[1], int(sys.argv[2])
if target not in (8, 9, 10, 11, 12, 13):
    raise SystemExit('Only reviewed additive migrations 8 through 13 are supported')
with sqlite3.connect(path, timeout=10) as db:
    db.execute('BEGIN IMMEDIATE')
    current = db.execute('PRAGMA user_version').fetchone()[0]
    if current not in (8, 9, 10, 11, 12, 13):
        raise RuntimeError('Unexpected schema version')
    if current >= 13 or target >= 13:
        required = {
            'source_jobs': {'source_id','id','state','scanned','count','attempts','requested','started','finished','next_run'},
            'metadata_jobs': {'source_id','resource_id','revision','resource','state','attempts','next_attempt','lock_id','lock_until','updated'},
            'media_location_overrides': {'media_id','lat','lon'},
        }
        for table, columns in required.items():
            if {row[1] for row in db.execute('PRAGMA table_info('+table+')')} != columns:
                raise RuntimeError('Source job compatibility tables are missing or incompatible')
    source_history = db.execute('SELECT name FROM schema_migrations WHERE version=13').fetchone()
    if source_history is not None and source_history[0] != 'source-jobs':
        raise RuntimeError('Unexpected source job migration history')
    if target < 13:
        db.execute('DELETE FROM schema_migrations WHERE version=13')
    else:
        db.execute('INSERT OR IGNORE INTO schema_migrations VALUES (13,?,?)', ('source-jobs', int(time.time()*1000)))
    if current >= 12 or target >= 12:
        position_columns = {row[1] for row in db.execute('PRAGMA table_info(trip_cover_positions)')}
        if position_columns != {'trip_id','media_id','x','y'}:
            raise RuntimeError('Cover positions table is missing or incompatible')
    position_history = db.execute('SELECT name FROM schema_migrations WHERE version=12').fetchone()
    if position_history is not None and position_history[0] != 'cover-positions':
        raise RuntimeError('Unexpected cover position migration history')
    if target < 12:
        db.execute('DELETE FROM schema_migrations WHERE version=12')
    else:
        db.execute('INSERT OR IGNORE INTO schema_migrations VALUES (12,?,?)', ('cover-positions', int(time.time()*1000)))
    if current >= 11 or target >= 11:
        cover_columns = {row[1] for row in db.execute('PRAGMA table_info(trip_cover_settings)')}
        if cover_columns != {'trip_id', 'mode', 'photo_ids'}:
            raise RuntimeError('Trip cover settings table is missing or incompatible')
    cover_history = db.execute('SELECT name FROM schema_migrations WHERE version=11').fetchone()
    if cover_history is not None and cover_history[0] != 'trip-covers':
        raise RuntimeError('Unexpected trip cover migration history')
    if target < 11:
        db.execute('DELETE FROM schema_migrations WHERE version=11')
    else:
        db.execute('INSERT OR IGNORE INTO schema_migrations VALUES (11,?,?)', ('trip-covers', int(time.time()*1000)))
    columns = {row[1] for row in db.execute('PRAGMA table_info(media)')}
    exclusions = {row[1] for row in db.execute('PRAGMA table_info(media_exclusions)')}
    if 'rotation' not in columns or exclusions != {'trip_id', 'user_id', 'resource_id', 'created'}:
        raise RuntimeError('Expected additive archive schema is missing')
    if not db.execute("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name='prevent_excluded_media_insert'").fetchone():
        raise RuntimeError('Exclusion trigger is missing')
    history = db.execute('SELECT name FROM schema_migrations WHERE version=9').fetchone()
    if history is not None and history[0] != 'media-archive':
        raise RuntimeError('Unexpected migration history')
    notification = db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='notification_state'").fetchone()
    if (current >= 10 or target >= 10) and notification is None:
        raise RuntimeError('Notification state table is missing')
    notification_history = db.execute('SELECT name FROM schema_migrations WHERE version=10').fetchone()
    if notification_history is not None and notification_history[0] != 'notification-state':
        raise RuntimeError('Unexpected notification migration history')
    if target < 10:
        db.execute('DELETE FROM schema_migrations WHERE version=10')
    else:
        db.execute('INSERT OR IGNORE INTO schema_migrations VALUES (10,?,?)', ('notification-state', int(time.time()*1000)))
    if target == 8:
        db.execute('DELETE FROM schema_migrations WHERE version=9')
    else:
        db.execute('INSERT OR IGNORE INTO schema_migrations VALUES (9,?,?)', ('media-archive', int(time.time()*1000)))
    db.execute('PRAGMA user_version = ' + str(target))
print('Compatible media archive schema marker:', target)
