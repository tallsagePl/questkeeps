import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { db, run, one, id, hash, encrypt } from '../lib/db';
import { handle } from '../lib/api';
import { session } from '../lib/access';
import { guestToken } from '../lib/guest-links';

after(() => db.close());

async function request(
  path: string,
  cookie = '',
  data?: unknown,
  method = data ? 'POST' : 'GET',
  origin = 'http://localhost:3000',
) {
  return handle(
    new NextRequest('http://localhost:3000/api/' + path, {
      method,
      headers: { cookie, origin, 'content-type': 'application/json' },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    }),
    path.split('/'),
  );
}

function fixture() {
  const owner = id();
  const follower = id();
  const other = id();
  const trip = id();
  for (const user of [owner, follower, other])
    run(
      'INSERT INTO users VALUES (?,?,?,?,?)',
      user,
      user + '@fixture.invalid',
      user,
      null,
      Date.now(),
    );
  const nonce = hash(id());
  run(
    'INSERT INTO trips(id,owner_id,title,destination,start,end,share_hash,created) VALUES (?,?,?,?,?,?,?,?)',
    trip,
    owner,
    'Private story',
    'Istanbul',
    '2026-10-10',
    '2026-10-18',
    nonce,
    Date.now(),
  );
  return {
    owner,
    follower,
    other,
    trip,
    token: guestToken({ id: trip, share_hash: nonce })!,
    ownerCookie: 'ta_session=' + session(owner),
    followerCookie: 'ta_session=' + session(follower),
    otherCookie: 'ta_session=' + session(other),
  };
}

test('following is private, idempotent and never grants participant or owner permissions', async () => {
  const f = fixture();
  assert.equal((await request('follows', '', { token: f.token })).status, 401);
  assert.equal(
    (await request('follows', f.followerCookie, { token: 'invalid' })).status,
    404,
  );
  assert.equal(
    (
      await request('follows', f.followerCookie, {
        token: f.token,
        user_id: f.other,
      })
    ).status,
    400,
  );
  assert.equal(
    (await request('follows', f.ownerCookie, { token: f.token })).status,
    400,
  );
  assert.equal(
    (await request('follows', f.followerCookie, { token: f.token })).status,
    200,
  );
  await request('follows', f.followerCookie, { token: f.token });
  assert.equal(
    one('SELECT count(*) n FROM trip_follows WHERE trip_id=?', f.trip)!.n,
    1,
  );
  const own = await (await request('follows', f.followerCookie)).json();
  assert.equal(own.trips.length, 1);
  assert.equal(own.trips[0].title, 'Private story');
  assert.ok(own.trips[0].url.startsWith('/s/v1.'));
  assert.ok(!JSON.stringify(own).includes('share_hash'));
  assert.deepEqual(
    (await (await request('follows', f.otherCookie)).json()).trips,
    [],
  );
  for (const path of [
    'trips/' + f.trip,
    'trips/' + f.trip + '/members',
    'trips/' + f.trip + '/share',
  ])
    assert.equal((await request(path, f.followerCookie)).status, 403);
  await request('follows/' + f.trip, f.otherCookie, undefined, 'DELETE');
  assert.equal(
    one('SELECT count(*) n FROM trip_follows WHERE trip_id=?', f.trip)!.n,
    1,
  );
  await request('follows/' + f.trip, f.followerCookie, undefined, 'DELETE');
  assert.deepEqual(
    (await (await request('follows', f.followerCookie)).json()).trips,
    [],
  );
});

test('revocation and rotation end followed access until a new valid link is supplied', async () => {
  const f = fixture();
  await request('follows', f.followerCookie, { token: f.token });
  const nextHash = hash(id());
  run('UPDATE trips SET share_hash=? WHERE id=?', nextHash, f.trip);
  assert.deepEqual(
    (await (await request('follows', f.followerCookie)).json()).trips,
    [],
  );
  assert.equal((await request('share/' + f.token)).status, 404);
  assert.equal(
    (await request('follows', f.followerCookie, { token: f.token })).status,
    404,
  );
  const next = guestToken({ id: f.trip, share_hash: nextHash })!;
  assert.equal(
    (
      await (
        await request('follows/status', f.followerCookie, { token: next })
      ).json()
    ).following,
    false,
  );
  await request('follows', f.followerCookie, { token: next });
  assert.equal(
    (await (await request('follows', f.followerCookie)).json()).trips.length,
    1,
  );
  run('UPDATE trips SET share_hash=NULL WHERE id=?', f.trip);
  assert.deepEqual(
    (await (await request('follows', f.followerCookie)).json()).trips,
    [],
  );
});

test('followed media counts exclude hidden, guest-hidden, missing and unapproved media', async () => {
  const f = fixture();
  const account = id();
  const source = id();
  const unapproved = id();
  run(
    'INSERT INTO accounts(id,user_id,yandex_id,label,token,disk_enabled) VALUES (?,?,?,?,?,1)',
    account,
    f.owner,
    id(),
    'Fixture',
    encrypt('fixture'),
  );
  for (const [sid, approved] of [
    [source, 1],
    [unapproved, 0],
  ])
    run(
      'INSERT INTO sources(id,trip_id,user_id,account_id,path,approved) VALUES (?,?,?,?,?,?)',
      sid,
      f.trip,
      f.owner,
      account,
      'disk:/' + sid,
      approved,
    );
  for (let n = 0; n < 5; n++)
    run(
      'INSERT INTO media(id,source_id,trip_id,user_id,resource_id,path,name,mime,kind,taken,date_basis,hidden,hidden_from_guests,missing) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      id(),
      n === 4 ? unapproved : source,
      f.trip,
      f.owner,
      id(),
      'disk:/' + n,
      'Photo',
      'image/jpeg',
      'photo',
      '2026-10-11',
      'manual',
      n === 1 ? 1 : 0,
      n === 2 ? 1 : 0,
      n === 3 ? 1 : 0,
    );
  await request('follows', f.followerCookie, { token: f.token });
  assert.equal(
    (await (await request('follows', f.followerCookie)).json()).trips[0]
      .media_count,
    1,
  );
});

test('anonymous intent survives login via an HttpOnly cookie; invalid intent and foreign origins are rejected', async () => {
  const f = fixture();
  assert.equal(
    (
      await request(
        'follows/pending',
        '',
        { token: f.token },
        'POST',
        'https://foreign.invalid',
      )
    ).status,
    403,
  );
  const pending = await request('follows/pending', '', { token: f.token });
  assert.equal(pending.status, 200);
  const header = pending.headers.get('set-cookie')!;
  assert.match(header, /HttpOnly/);
  const value = header.split(';')[0];
  const result = await request(
    'follows/accept',
    f.followerCookie + '; ' + value,
    {},
  );
  assert.equal((await result.json()).accepted, true);
  assert.match(result.headers.get('set-cookie')!, /Max-Age=0/i);
  const other = fixture();
  const oldPending = await request('follows/pending', '', {
    token: other.token,
  });
  run('UPDATE trips SET share_hash=NULL WHERE id=?', other.trip);
  const expired = await request(
    'follows/accept',
    other.followerCookie +
      '; ' +
      oldPending.headers.get('set-cookie')!.split(';')[0],
    {},
  );
  assert.equal((await expired.json()).accepted, false);
  assert.equal(
    one('SELECT 1 FROM trip_follows WHERE trip_id=?', other.trip),
    undefined,
  );
});
