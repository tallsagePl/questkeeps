import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
process.env.DATABASE_PATH = './data/friends-test-' + randomUUID() + '.sqlite';
process.env.APP_URL = 'http://localhost:3000';
process.env.TOKEN_ENCRYPTION_KEY = '12'.repeat(32);
const { db, run, one, id } = await import('../lib/db');
const { handle } = await import('../lib/api');
const { session } = await import('../lib/access');
const { ensureUsername } = await import('../lib/profiles');
const [alice, bob, eve] = [id(), id(), id()];
for (const [uid, name] of [
  [alice, 'Alice'],
  [bob, 'Bob'],
  [eve, 'Eve'],
]) {
  run(
    'INSERT INTO users VALUES (?,?,?,?,?)',
    uid,
    uid + '@fixture.invalid',
    name,
    null,
    Date.now(),
  );
  ensureUsername(uid);
}
const cookies = new Map(
  [alice, bob, eve].map((u) => [u, 'ta_session=' + session(u)]),
);
const trip = id();
run(
  'INSERT INTO trips(id,owner_id,title,destination,start,end,created) VALUES (?,?,?,?,?,?,?)',
  trip,
  bob,
  'Private trip',
  'Fixture',
  '2026-10-10',
  '2026-10-18',
  Date.now(),
);
async function request(
  user: string | null,
  p: string,
  method = 'GET',
  body?: unknown,
  origin = 'http://localhost:3000',
) {
  return handle(
    new NextRequest('http://localhost:3000/api/' + p, {
      method,
      headers: {
        origin,
        cookie: user ? cookies.get(user)! : '',
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    p.split('?')[0].split('/'),
  );
}
after(() => db.close());
test('friendship requires recipient consent, keeps private lists and never grants trip access', async () => {
  assert.equal((await request(null, 'friends')).status, 401);
  assert.equal((await request(alice, 'friends/' + alice, 'POST')).status, 400);
  assert.equal(
    (
      await request(
        alice,
        'friends/' + bob,
        'POST',
        undefined,
        'https://other.invalid',
      )
    ).status,
    403,
  );
  const sent = await request(alice, 'friends/' + bob, 'POST');
  assert.equal(sent.status, 200);
  assert.equal((await sent.json()).relationship, 'outgoing');
  assert.equal((await request(bob, 'friends/' + alice, 'POST')).status, 409);
  assert.equal(
    (await request(alice, 'friends/' + bob, 'PATCH', { action: 'accept' }))
      .status,
    403,
  );
  assert.equal(
    (await request(eve, 'friends/' + bob, 'PATCH', { action: 'accept' }))
      .status,
    403,
  );
  let incoming = await (await request(bob, 'friends')).json();
  assert.equal(incoming.incoming[0].id, alice);
  assert.equal(incoming.friends.length, 0);
  assert.equal(
    (await request(bob, 'friends/' + alice, 'PATCH', { action: 'accept' }))
      .status,
    200,
  );
  const accepted = await (await request(alice, 'friends')).json();
  assert.equal(accepted.friends[0].id, bob);
  assert.equal(accepted.outgoing.length, 0);
  assert.equal(JSON.stringify(accepted).includes('@fixture.invalid'), false);
  assert.equal(JSON.stringify(accepted).includes('password'), false);
  assert.equal((await request(alice, 'trips/' + trip)).status, 403);
  assert.deepEqual(await (await request(eve, 'friends')).json(), {
    friends: [],
    incoming: [],
    outgoing: [],
  });
  assert.equal(
    (await request(eve, 'profiles/' + ensureUsername(alice) + '/friends'))
      .status,
    404,
  );
  await request(eve, 'friends/' + alice, 'DELETE');
  assert.equal(
    (await (await request(alice, 'friends')).json()).friends.length,
    1,
  );
  assert.equal((await request(alice, 'friends/' + bob, 'DELETE')).status, 200);
  assert.equal(
    (await (await request(bob, 'friends')).json()).friends.length,
    0,
  );
  const duplicate = await Promise.all([
    request(alice, 'friends/' + bob, 'POST'),
    request(alice, 'friends/' + bob, 'POST'),
  ]);
  assert.deepEqual(
    duplicate.map((r) => r.status),
    [200, 200],
  );
  assert.equal(one('SELECT count(*) n FROM friendships')!.n, 1);
  await request(bob, 'friends/' + alice, 'DELETE');
  assert.equal(one('SELECT count(*) n FROM friendships')!.n, 0);
});
