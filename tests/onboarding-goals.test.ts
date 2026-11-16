import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { NextRequest } from 'next/server';
import { session } from '../lib/access';
import { handle } from '../lib/api';
import { db, one, run } from '../lib/db';
import { migrate } from '../lib/migrations';

test('only a new account receives the first trip and visible import milestones once', async () => {
  const migration = one<{ applied: number }>(
    "SELECT applied FROM schema_migrations WHERE name='onboarding-goals'",
  )!;
  run(
    'INSERT INTO users VALUES (?,?,?,?,?)',
    'new',
    null,
    'New',
    null,
    migration.applied,
  );
  run(
    'INSERT INTO users VALUES (?,?,?,?,?)',
    'existing',
    null,
    'Existing',
    null,
    migration.applied - 1,
  );
  const url = new URL('http://localhost:3000/api/onboarding-goals');
  const claim = (cookie = '') =>
    handle(
      new NextRequest(url, {
        method: 'POST',
        headers: { origin: url.origin, cookie },
      }),
      ['onboarding-goals'],
    );
  const newCookie = 'ta_session=' + session('new');
  assert.equal((await claim()).status, 401);
  assert.deepEqual(await (await claim(newCookie)).json(), { goals: [] });
  for (const user of ['new', 'existing'])
    run(
      'INSERT INTO trips(id,owner_id,title,destination,start,end,created) VALUES (?,?,?,?,?,?,?)',
      'trip-' + user,
      user,
      'Fixture',
      'Fixture',
      '2026-04-01',
      '2026-04-10',
      migration.applied,
    );
  assert.deepEqual(
    await (await claim('ta_session=' + session('existing'))).json(),
    { goals: [] },
  );
  assert.deepEqual(await (await claim(newCookie)).json(), {
    goals: ['onboarding_first_trip'],
  });
  assert.deepEqual(await (await claim(newCookie)).json(), { goals: [] });
  run(
    'INSERT INTO accounts(id,user_id,yandex_id,label,token,disk_enabled) VALUES (?,?,?,?,?,1)',
    'fixture-account',
    'new',
    'fixture-yandex',
    'Fixture',
    'fixture-token',
  );
  run(
    'INSERT INTO sources(id,trip_id,user_id,account_id,path,approved) VALUES (?,?,?,?,?,1)',
    'fixture-source',
    'trip-new',
    'new',
    'fixture-account',
    'disk:/fixture',
  );
  run(
    "INSERT INTO media(id,source_id,trip_id,user_id,resource_id,path,name,mime,kind,taken,date_basis,hidden) VALUES (?,?,?,?,?,?,?,'image/jpeg','photo',?,'created',1)",
    'fixture-media',
    'fixture-source',
    'trip-new',
    'new',
    'fixture-id',
    'disk:/fixture/photo.jpg',
    'photo.jpg',
    '2026-04-04',
  );
  assert.deepEqual(await (await claim(newCookie)).json(), { goals: [] });
  run("UPDATE media SET hidden=0 WHERE id='fixture-media'");
  const claims = await Promise.all([claim(newCookie), claim(newCookie)]);
  const received = await Promise.all(claims.map((response) => response.json()));
  assert.deepEqual(
    received.flatMap((response) => response.goals),
    ['onboarding_first_import'],
  );
  const rollback = spawnSync(
    process.platform === 'win32' ? 'python' : 'python3',
    ['deploy/media-archive-schema.py', process.env.DATABASE_PATH!, '16'],
    { encoding: 'utf8', windowsHide: true },
  );
  assert.equal(rollback.status, 0, rollback.stderr);
  assert.equal(db.pragma('user_version', { simple: true }), 16);
  migrate(db);
  assert.equal(db.pragma('user_version', { simple: true }), 18);
  assert.deepEqual(
    one('SELECT applied FROM schema_migrations WHERE version=17'),
    migration,
  );
  assert.deepEqual(await (await claim(newCookie)).json(), { goals: [] });
});
