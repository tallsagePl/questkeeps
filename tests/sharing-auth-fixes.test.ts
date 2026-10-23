import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { db, run, one, hash, decrypt, id } from '../lib/db';
import { handle } from '../lib/api';
import { session, userProfile, viewAccess } from '../lib/access';
import { queueVerification } from '../lib/email-verification';

after(() => db.close());

async function request(path: string, cookie = '', data?: unknown) {
  const url = new URL('http://localhost:3000/api/' + path);
  return handle(
    new NextRequest(url, {
      method: data === undefined ? 'GET' : 'POST',
      headers: {
        cookie,
        origin: url.origin,
        'content-type': 'application/json',
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    }),
    url.pathname.slice(5).split('/'),
  );
}

function account(name: string) {
  const userId = id();
  run(
    'INSERT INTO users VALUES (?,?,?,?,?)',
    userId,
    name + '@fixture.invalid',
    name,
    null,
    Date.now(),
  );
  userProfile(userId);
  return { id: userId, cookie: 'ta_session=' + session(userId) };
}

function trip(userId: string, raw: string | null = null) {
  const tripId = id();
  run(
    'INSERT INTO trips(id,owner_id,title,destination,start,end,share_hash,created) VALUES (?,?,?,?,?,?,?,?)',
    tripId,
    userId,
    'Fixture',
    'Fixture',
    '2026-10-10',
    '2026-10-18',
    raw ? hash(raw) : null,
    Date.now(),
  );
  return tripId;
}

test('owners retrieve the same guest link after refresh without invalidating legacy links; rotation and revoke invalidate both', async () => {
  const owner = account('link-owner');
  const stranger = account('link-stranger');
  const legacy = 'fixture-legacy-secret';
  const tripId = trip(owner.id, legacy);
  const before = one(
    'SELECT share_hash FROM trips WHERE id=?',
    tripId,
  )!.share_hash;
  const endpoint = 'trips/' + tripId + '/share';
  assert.equal((await request(endpoint, stranger.cookie)).status, 403);
  assert.equal((await request(endpoint)).status, 401);
  const result = await (await request(endpoint, owner.cookie)).json();
  const same = await (await request(endpoint, owner.cookie)).json();
  assert.equal(same.url, result.url);
  assert.equal(
    one('SELECT share_hash FROM trips WHERE id=?', tripId)!.share_hash,
    before,
  );
  const signed = result.url.split('/s/')[1];
  assert.equal((await request('share/' + signed)).status, 200);
  assert.equal((await request('share/' + legacy)).status, 200);
  const tampered = signed.slice(0, -1) + (signed.endsWith('A') ? 'B' : 'A');
  assert.equal((await request('share/' + tampered)).status, 404);
  const other = trip(owner.id);
  assert.throws(
    () =>
      viewAccess(new Request('http://localhost:3000/?share=' + signed), other),
    /messages.invalidLink|Недействительная|ссылк/i,
  );
  const guest = await (await request('share/' + signed)).text();
  assert.ok(!guest.includes('share_hash'));
  assert.ok(!guest.includes('link-owner@fixture.invalid'));
  const rotated = await (
    await request(endpoint, owner.cookie, { enabled: true })
  ).json();
  assert.notEqual(rotated.url, result.url);
  assert.equal((await request('share/' + legacy)).status, 404);
  assert.equal((await request('share/' + signed)).status, 404);
  assert.equal(
    (await request('share/' + rotated.url.split('/s/')[1])).status,
    200,
  );
  await request(endpoint, owner.cookie, { enabled: false });
  assert.equal(
    (await request('share/' + rotated.url.split('/s/')[1])).status,
    404,
  );
  assert.equal(
    (await (await request(endpoint, owner.cookie)).json()).url,
    null,
  );
});

test('member metadata includes public avatars without emails or account identifiers', async () => {
  const owner = account('avatar-owner');
  const member = account('avatar-member');
  const tripId = trip(owner.id);
  run(
    'INSERT INTO user_avatars VALUES (?,?,?)',
    owner.id,
    Buffer.from('fixture-image'),
    'version',
  );
  run(
    'INSERT INTO members(trip_id,user_id,start,end,active) VALUES (?,?,?,?,1)',
    tripId,
    member.id,
    '2026-10-10',
    '2026-10-18',
  );
  const response = await request('trips/' + tripId + '/members', member.cookie);
  const body = await response.json();
  assert.equal(body.owner.hasAvatar, true);
  assert.equal(body.owner.username, 'avatarowner');
  assert.equal(body.members[0].hasAvatar, false);
  assert.ok(!JSON.stringify(body).includes('@fixture.invalid'));
  assert.ok(!JSON.stringify(body).includes('yandexAccountId'));
});

test('one-time email verification creates a session and replay cannot create another', async () => {
  const user = account('verify-login');
  run('INSERT INTO email_status(user_id,required) VALUES (?,1)', user.id);
  queueVerification(user.id, 'verify-login@fixture.invalid');
  const job = one(
    'SELECT payload FROM delivery_jobs WHERE user_id=?',
    user.id,
  )!;
  const token = JSON.parse(decrypt(job.payload)).url.split('#token=')[1];
  const verified = await request('auth/verify-email', '', { token });
  assert.equal(verified.status, 200);
  assert.equal((await verified.json()).user.id, user.id);
  const cookie = verified.headers
    .get('set-cookie')!
    .match(/ta_session=[^;]+/)![0];
  assert.match(verified.headers.get('set-cookie')!, /HttpOnly/);
  assert.equal((await (await request('me', cookie)).json()).user.id, user.id);
  const count = one(
    'SELECT count(*) n FROM sessions WHERE user_id=?',
    user.id,
  )!.n;
  const replay = await request('auth/verify-email', '', { token });
  assert.equal(replay.status, 400);
  assert.equal(replay.headers.has('set-cookie'), false);
  assert.equal(
    one('SELECT count(*) n FROM sessions WHERE user_id=?', user.id)!.n,
    count,
  );
});

test('verification never silently switches an existing different account', async () => {
  const pending = account('pending-other');
  const current = account('current-other');
  run('INSERT INTO email_status(user_id,required) VALUES (?,1)', pending.id);
  queueVerification(pending.id, 'pending-other@fixture.invalid');
  const token = JSON.parse(
    decrypt(
      one('SELECT payload FROM delivery_jobs WHERE user_id=?', pending.id)!
        .payload,
    ),
  ).url.split('#token=')[1];
  const verified = await request('auth/verify-email', current.cookie, {
    token,
  });
  assert.equal(verified.status, 200);
  assert.deepEqual(await verified.json(), {
    verified: true,
    signInRequired: true,
  });
  assert.equal(verified.headers.has('set-cookie'), false);
  assert.equal(
    (await (await request('me', current.cookie)).json()).user.id,
    current.id,
  );
});
