import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { NextRequest } from 'next/server';
import { handle } from '../lib/api';
import { session } from '../lib/access';
import { migrate } from '../lib/migrations';
import { db, run, encrypt, hash } from '../lib/db';
import { guestToken } from '../lib/guest-links';
import { tripCovers, coverSettings } from '../lib/trip-covers';

after(() => db.close());

test('favorite covers respect guest visibility, membership dates and source approval', async () => {
  for (const user of ['owner', 'member', 'follower', 'stranger'])
    run(
      'INSERT INTO users VALUES (?,?,?,?,?)',
      user,
      user + '@fixture.invalid',
      user,
      null,
      Date.now(),
    );
  const shareHash = hash('legacy-fixture-link');
  const token = guestToken({ id: 'trip', share_hash: shareHash })!;
  run(
    'INSERT INTO trips(id,owner_id,title,destination,start,end,share_hash,created) VALUES (?,?,?,?,?,?,?,?)',
    'trip',
    'owner',
    'Trip',
    'City',
    '2026-10-10',
    '2026-10-18',
    shareHash,
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
  const guest = tripCovers('trip', '', token);
  assert.deepEqual(
    guest.map((x) => x.id),
    ['public', 'outside-member'],
  );
  assert.equal(guest[0].rotation, 90);
  assert.equal(
    new URL(guest[0].src, 'https://fixture.invalid').searchParams.get('share'),
    token,
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
        positions: { public: { x: 25, y: 80 }, private: { x: 50, y: 20 } },
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
    tripCovers('trip', '', token).map((x) => x.id),
    ['public'],
  );
  const cookies = new Map(
    ['member', 'follower'].map((user) => [user, 'ta_session=' + session(user)]),
  );
  const viewRequest = (
    path: string,
    user = '',
    input?: { token: string },
    etag?: string,
  ) =>
    handle(
      new NextRequest('http://localhost:3000/api/' + path, {
        method: input ? 'POST' : 'GET',
        headers: {
          cookie: cookies.get(user) || '',
          origin: 'http://localhost:3000',
          'content-type': 'application/json',
          ...(etag ? { 'if-none-match': etag } : {}),
        },
        ...(input ? { body: JSON.stringify(input) } : {}),
      }),
      path.split('?')[0].split('/'),
    );
  const memberList = await (await viewRequest('trips', 'member')).json();
  const sharedPosition = { x: 25, y: 80 };
  assert.deepEqual(
    memberList.trips[0].covers.find(
      (cover: { id: string }) => cover.id === 'public',
    ).position,
    sharedPosition,
  );
  const memberDetail = await (await viewRequest('trips/trip', 'member')).json();
  assert.deepEqual(memberDetail.trip.covers, memberList.trips[0].covers);
  assert.deepEqual(tripCovers('trip', '', 'invalid-link'), []);
  const guestPath = 'share/' + token;
  const guestDetail = await viewRequest(guestPath);
  const initialEtag = guestDetail.headers.get('etag')!;
  const guestDeck = (await guestDetail.json()).trip.covers;
  assert.deepEqual(
    guestDeck.map((cover: { id: string }) => cover.id),
    ['public'],
  );
  assert.deepEqual(guestDeck[0].position, sharedPosition);
  assert.equal(
    (await viewRequest(guestPath, '', undefined, initialEtag)).status,
    304,
  );
  const legacyDetail = await viewRequest(
    'share/legacy-fixture-link',
    '',
    undefined,
    initialEtag,
  );
  assert.equal(legacyDetail.status, 200);
  assert.equal(
    new URL(
      (await legacyDetail.json()).trip.covers[0].src,
      'http://localhost:3000',
    ).searchParams.get('share'),
    'legacy-fixture-link',
  );
  assert.equal(
    (await viewRequest('follows', 'follower', { token })).status,
    200,
  );
  const followerList = await (await viewRequest('follows', 'follower')).json();
  assert.deepEqual(followerList.trips[0].covers, guestDeck);
  assert.equal(
    (
      await request('owner', {
        mode: 'selected',
        photoIds: ['public', 'private'],
        positions: { public: { x: 45, y: 15 } },
      })
    ).status,
    200,
  );
  const updatedGuest = await viewRequest(guestPath, '', undefined, initialEtag);
  assert.equal(updatedGuest.status, 200);
  assert.deepEqual((await updatedGuest.json()).trip.covers[0].position, {
    x: 45,
    y: 15,
  });
  assert.equal(
    (
      await request('owner', {
        mode: 'selected',
        photoIds: ['public', 'private'],
        positions: { public: sharedPosition },
      })
    ).status,
    200,
  );
  run(
    'DELETE FROM media_favorites WHERE user_id=? AND media_id=?',
    'owner',
    'public',
  );
  assert.deepEqual(tripCovers('trip', '', token), []);
  assert.equal(
    (await viewRequest('media/private/preview?share=' + token)).status,
    404,
  );
  run('UPDATE trips SET share_hash=NULL WHERE id=?', 'trip');
  assert.deepEqual(tripCovers('trip', '', token), []);
  assert.deepEqual(
    (await (await viewRequest('follows', 'follower')).json()).trips,
    [],
  );
  assert.equal(
    (await viewRequest(guestPath, '', undefined, initialEtag)).status,
    404,
  );
  assert.deepEqual(coverSettings('trip').positions?.public, { x: 25, y: 80 });
  assert.deepEqual(
    tripCovers('trip', 'owner').map((x) => x.id),
    ['private'],
  );
  assert.equal(
    (
      await request('owner', {
        mode: 'selected',
        photoIds: [
          'public',
          'private',
          'hidden',
          'missing',
          'video',
          'ordinary',
        ],
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request('owner', {
        mode: 'selected',
        photoIds: ['private'],
        positions: { private: { x: -1, y: 50 } },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request('owner', {
        mode: 'selected',
        photoIds: ['private'],
        positions: { public: { x: 50, y: 50 } },
      })
    ).status,
    400,
  );
  assert.deepEqual(tripCovers('trip', 'owner')[0].position, { x: 50, y: 20 });
  const marker = spawnSync(
    process.platform === 'win32' ? 'python' : 'python3',
    ['deploy/media-archive-schema.py', process.env.DATABASE_PATH!, '11'],
    { encoding: 'utf8', windowsHide: true },
  );
  assert.equal(marker.status, 0, marker.stderr);
  assert.deepEqual(coverSettings('trip').positions?.public, { x: 25, y: 80 });
  assert.deepEqual(coverSettings('trip').photoIds, ['public', 'private']);
  migrate(db);
  assert.equal(db.pragma('user_version', { simple: true }), 18);
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
