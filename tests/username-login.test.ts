import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
process.env.DATABASE_PATH = './data/username-login-' + randomUUID() + '.sqlite';
process.env.APP_URL = 'http://localhost:3000';
const { db, run, all, one } = await import('../lib/db');
const { handle } = await import('../lib/api');
const password = 'FixturePassword123!';
async function request(path: string, data: unknown) {
  return handle(
    new NextRequest('http://localhost:3000/api/' + path, {
      method: 'POST',
      headers: {
        origin: 'http://localhost:3000',
        'content-type': 'application/json',
      },
      body: JSON.stringify(data),
    }),
    path.split('/'),
  );
}
async function fixture(email: string, username: string) {
  const r = await request('auth/register', {
    email,
    password,
    name: 'VisibleName',
  });
  assert.equal(r.status, 200);
  const user = (await r.json()).user;
  run('UPDATE user_handles SET username=? WHERE user_id=?', username, user.id);
  return { ...user, username };
}
const alice = await fixture('night@example.invalid', 'night_owl'),
  bob = await fixture('bob@example.invalid', 'someone_else'),
  limited = await fixture('limited@example.invalid', 'rate_limited');
after(() => db.close());
test('email and unique handle identify the same account, regardless of case and @ prefix', async () => {
  for (const email of [
    'night@example.invalid',
    '  NIGHT@EXAMPLE.INVALID  ',
    'night_owl',
    '@night_owl',
    '@NiGhT_OwL',
    '  NIGHT_OWL  ',
  ]) {
    const r = await request('auth/login', { email, password });
    assert.equal(r.status, 200, email);
    const value = await r.json();
    assert.equal(value.user.id, alice.id);
    assert.equal(value.user.password, undefined);
    assert.equal(value.user.username, 'night_owl');
    assert.match(r.headers.get('set-cookie') || '', /HttpOnly/);
    assert.match(r.headers.get('set-cookie') || '', /SameSite=Lax/);
  }
  assert.equal(
    (await request('auth/login', { email: 'someone_else', password })).status,
    200,
  );
  assert.equal(
    one('SELECT name FROM users WHERE id=?', bob.id)!.name,
    'VisibleName',
  );
});
test('wrong passwords, missing handles and non-unique display names never authenticate', async () => {
  const wrong = await request('auth/login', {
      email: 'night_owl',
      password: 'WrongPassword123!',
    }),
    missing = await request('auth/login', {
      email: 'missing_handle',
      password: 'WrongPassword123!',
    });
  assert.equal(wrong.status, 401);
  assert.equal(missing.status, 401);
  assert.deepEqual(await wrong.json(), await missing.json());
  assert.equal(wrong.headers.has('set-cookie'), false);
  const display = await request('auth/login', {
    email: 'VisibleName',
    password,
  });
  assert.equal(display.status, 401);
  assert.equal(display.headers.has('set-cookie'), false);
  for (const email of ['@@night_owl', 'night_owl OR 1=1', 'x'.repeat(255)])
    assert.equal(
      (await request('auth/login', { email, password })).status,
      400,
    );
  assert.equal(
    (
      await request('auth/register', {
        email: 'night_owl',
        password,
        name: 'New',
      })
    ).status,
    400,
  );
});
test('renamed usernames work immediately and the old username stops working', async () => {
  run(
    'UPDATE user_handles SET username=? WHERE user_id=?',
    'new_owl',
    alice.id,
  );
  assert.equal(
    (await request('auth/login', { email: 'night_owl', password })).status,
    401,
  );
  const r = await request('auth/login', { email: '@NEW_OWL', password });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).user.id, alice.id);
});
test('all login aliases share an account rate limit and throttle identifiers contain no raw email', async () => {
  const aliases = [
    'limited@example.invalid',
    '@rate_limited',
    'RATE_LIMITED',
    '@RATE_LIMITED',
  ];
  for (let i = 0; i < 10; i++)
    assert.equal(
      (
        await request('auth/login', {
          email: aliases[i % aliases.length],
          password: 'WrongPassword123!',
        })
      ).status,
      401,
    );
  const blocked = await request('auth/login', {
    email: 'rate_limited',
    password,
  });
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.has('set-cookie'), false);
  assert.equal(
    one('SELECT count FROM throttle WHERE key=?', 'auth:account:' + limited.id)!
      .count,
    11,
  );
  assert.ok(
    all('SELECT key FROM throttle').every(
      (r) => !r.key.includes('@example.invalid'),
    ),
  );
});
