#!/usr/bin/env python3
"""Switch the reviewed compatibility markers 8 through 18."""
import sqlite3
import sys
import time

path, target = sys.argv[1], int(sys.argv[2])
if target not in range(8, 19):
    raise SystemExit('Only reviewed additive migrations 8 through 18 are supported')
with sqlite3.connect(path, timeout=10) as db:
    db.execute('BEGIN IMMEDIATE')
    current = db.execute('PRAGMA user_version').fetchone()[0]
    if current not in range(8, 19):
        raise RuntimeError('Unexpected schema version')
    if current >= 18 or target >= 18:
        if {row[1] for row in db.execute('PRAGMA table_info(photo_self_marks)')} != {'media_id', 'user_id'}:
            raise RuntimeError('Photo self-mark compatibility schema is missing')
        mark_history = db.execute('SELECT name FROM schema_migrations WHERE version=18').fetchone()
        if mark_history != ('photo-self-marks',):
            raise RuntimeError('Unexpected photo self-mark migration history')
    # Version 17 ignores the additive table and ledger entry, preserving marks
    # through rollback and a subsequent upgrade.
    if current >= 17 or target >= 17:
        if {row[1] for row in db.execute('PRAGMA table_info(onboarding_goals)')} != {'user_id', 'goal'}:
            raise RuntimeError('Onboarding goal compatibility schema is missing')
        onboarding_history = db.execute('SELECT name FROM schema_migrations WHERE version=17').fetchone()
        if onboarding_history != ('onboarding-goals',):
            raise RuntimeError('Unexpected onboarding goal migration history')
    # Keep the onboarding ledger timestamp through rollback. It is the eligibility
    # cutoff for new accounts and version 16 ignores this additive ledger row.
    if current >= 16 or target >= 16:
        if 'can_manage' not in {row[1] for row in db.execute('PRAGMA table_info(members)')}:
            raise RuntimeError('Trip manager compatibility schema is missing')
        if not db.execute("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name='revoke_inactive_trip_manager'").fetchone():
            raise RuntimeError('Trip manager revocation trigger is missing')
    manager_history = db.execute('SELECT name FROM schema_migrations WHERE version=16').fetchone()
    if manager_history is not None and manager_history[0] != 'trip-managers':
        raise RuntimeError('Unexpected trip manager migration history')
    if target < 16:
        db.execute('DELETE FROM schema_migrations WHERE version=16')
    else:
        db.execute('INSERT OR IGNORE INTO schema_migrations VALUES (16,?,?)', ('trip-managers', int(time.time()*1000)))
    if current >= 15 or target >= 15:
        if {row[1] for row in db.execute('PRAGMA table_info(password_resets)')} != {'hash','user_id','expires','credential_hash'}:
            raise RuntimeError('Password recovery compatibility schema is missing')
    history15=db.execute('SELECT name FROM schema_migrations WHERE version=15').fetchone()
    if history15 is not None and history15[0]!='password-recovery':
        raise RuntimeError('Unexpected password recovery migration history')
    if target<15: db.execute('DELETE FROM schema_migrations WHERE version=15')
    else: db.execute('INSERT OR IGNORE INTO schema_migrations VALUES (15,?,?)',('password-recovery',int(time.time()*1000)))
    if current >= 14 or target >= 14:
        expected={'trip_id','user_id','signature','state','result','cursor','total','lock_id','lock_until','attempts','next_run','updated'}
        if {row[1] for row in db.execute('PRAGMA table_info(geo_jobs)')} != expected:
            raise RuntimeError('Geo job compatibility schema is missing')
        if not {'terminal','last_error','created'}.issubset({row[1] for row in db.execute('PRAGMA table_info(telegram_outbox)')}):
            raise RuntimeError('Delivery queue compatibility schema is missing')
        for table, columns in {'app_clock': {'id','version'}, 'public_article_cache': {'key','json','updated'}, 'account_refresh_locks': {'account_id','owner','lock_until'}}.items():
            if {row[1] for row in db.execute('PRAGMA table_info('+table+')')} != columns:
                raise RuntimeError('Service cache compatibility schema is missing')
    history14=db.execute('SELECT name FROM schema_migrations WHERE version=14').fetchone()
    if history14 is not None and history14[0]!='service-queues':
        raise RuntimeError('Unexpected service queue migration history')
    if target<14: db.execute('DELETE FROM schema_migrations WHERE version=14')
    else: db.execute('INSERT OR IGNORE INTO schema_migrations VALUES (14,?,?)',('service-queues',int(time.time()*1000)))
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
