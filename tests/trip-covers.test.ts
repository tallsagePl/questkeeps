import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { NextRequest } from 'next/server';
import { handle } from '../lib/api';
import { session } from '../lib/access';
import { migrate } from '../lib/migrations';
import { db, run, encrypt } from '../lib/db';
import { tripCovers, coverSettings } from '../lib/trip-covers';

after(() => db.close());

test('favorite covers respect guest visibility, membership dates and source approval', async () => {
  for (const user of ['owner', 'member', 'stranger'])
    run(
      'INSERT INTO users VALUES (?,?,?,?,?)',
      user,
      user + '@fixture.invalid',
      user,
      null,
      Date.now(),
    );
  run(
    'INSERT INTO trips(id,owner_id,title,destination,start,end,created) VALUES (?,?,?,?,?,?,?)',
    'trip',
    'owner',
    'Trip',
    'City',
    '2026-10-10',
    '2026-10-18',
    Date.now(),
  );
  run(
    'INSERT INTO members(trip_id,user_id,start,end) VALUES (?,?,?,?)',
    'trip',
    'member',
    '2026-10-12',
    '2026-10-13',
  );
  run(
    'INSERT INTO accounts(id,user_id,yandex_id,label,token) VALUES (?,?,?,?,?)',
    'account',
    'owner',
    'yandex',
    'Fixture',
    encrypt('dummy'),
  );
  run(
    'INSERT INTO sources(id,trip_id,user_id,account_id,path,approved) VALUES (?,?,?,?,?,1)',
    'source',
    'trip',
    'owner',
    'account',
    'disk:/fixture',
  );
  for (const [id, day] of [
    ['public', '2026-10-12'],
    ['private', '2026-10-12'],
    ['hidden', '2026-10-12'],
    ['missing', '2026-10-12'],
    ['outside-member', '2026-10-15'],
    ['outside-trip', '2026-10-20'],
    ['ordinary', '2026-10-12'],
    ['video', '2026-10-12'],
  ]) {
    run(
      "INSERT INTO media(id,source_id,trip_id,user_id,resource_id,path,name,mime,kind,taken,revision,rotation,hidden,hidden_from_guests,missing,date_basis) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'created')",
      id,
      'source',
      'trip',
      'owner',
      id,
      'disk:/' + id,
      id,
      'image/jpeg',
      id === 'video' ? 'video' : 'photo',
      day,
      'revision',
      90,
      Number(id === 'hidden'),
      Number(id === 'private'),
      Number(id === 'missing'),
    );
    if (id !== 'ordinary')
      for (const user of ['owner', 'member', 'stranger'])
        run('INSERT INTO media_favorites VALUES (?,?)', user, id);
  }
  assert.deepEqual(
    tripCovers('trip', 'member').map((x) => x.id),
    ['private', 'public'],
  );
  assert.deepEqual(tripCovers('trip', 'stranger'), []);
  const guest = tripCovers('trip', 'owner', 'guest-token');
  assert.deepEqual(
    guest.map((x) => x.id),
    ['public', 'outside-member'],
  );
  assert.equal(guest[0].rotation, 90);
  assert.equal(
    new URL(guest[0].src, 'https://fixture.invalid').searchParams.get('share'),
    'guest-token',
  );
  assert.deepEqual(
    tripCovers('trip', 'owner').map((x) => x.id),
    ['private', 'public', 'outside-member'],
  );
  run('UPDATE sources SET approved=0 WHERE id=?', 'source');
  assert.deepEqual(tripCovers('trip', 'owner'), []);
  run('UPDATE sources SET approved=1 WHERE id=?', 'source');
  const request = (user: string, body?: unknown) =>
    handle(
      new NextRequest('http://localhost:3000/api/trips/trip/cover', {
        method: body ? 'PATCH' : 'GET',
        headers: {
          cookie: user ? 'ta_session=' + session(user) : '',
          origin: 'http://localhost:3000',
          'content-type': 'application/json',
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
      ['trips', 'trip', 'cover'],
    );
  assert.equal(
    (await request('member', { mode: 'selected', photoIds: ['public'] }))
      .status,
    403,
  );
  assert.equal((await request('stranger')).status, 403);
  assert.equal((await request('')).status, 401);
  for (const ids of [
    [],
    ['ordinary'],
    ['video'],
    ['hidden'],
    ['missing'],
    ['outside-trip'],
    ['foreign-photo'],
  ])
    assert.equal(
      (await request('owner', { mode: 'selected', photoIds: ids })).status,
      400,
    );
  assert.equal(
    (
      await request('owner', {
        mode: 'selected',
        photoIds: ['public', 'private'],
      })
    ).status,
    200,
  );
  assert.deepEqual((await (await request('owner')).json()).photoIds, [
    'public',
    'private',
  ]);
  assert.deepEqual(
    tripCovers('trip', 'owner').map((x) => x.id),
    ['private', 'public'],
  );
  assert.deepEqual(
    tripCovers('trip', 'owner', 'guest-token').map((x) => x.id),
    ['public'],
  );
  run(
    'DELETE FROM media_favorites WHERE user_id=? AND media_id=?',
    'owner',
    'public',
  );
  assert.deepEqual(tripCovers('trip', 'owner', 'guest-token'), []);
  assert.deepEqual(
    tripCovers('trip', 'owner').map((x) => x.id),
    ['private'],
  );
  const marker = spawnSync(
    process.platform === 'win32' ? 'python' : 'python3',
    ['deploy/media-archive-schema.py', process.env.DATABASE_PATH!, '10'],
    { encoding: 'utf8', windowsHide: true },
  );
  assert.equal(marker.status, 0, marker.stderr);
  assert.deepEqual(coverSettings('trip').photoIds, ['public', 'private']);
  migrate(db);
  assert.equal(db.pragma('user_version', { simple: true }), 11);
  assert.deepEqual(coverSettings('trip').photoIds, ['public', 'private']);
  assert.equal(
    (await request('owner', { mode: 'all', photoIds: [] })).status,
    200,
  );
  assert.deepEqual(
    tripCovers('trip', 'owner').map((x) => x.id),
    ['private', 'outside-member'],
  );
});
