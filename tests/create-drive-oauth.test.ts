import assert from 'node:assert/strict';
import { after, test, type TestContext } from 'node:test';
import { NextRequest } from 'next/server';
import { createTripDiskEntry, oauthRegistrationHash } from '../lib/trip-entry';

process.env.YANDEX_CLIENT_ID = 'fixture-client';

const { db, one, run, encrypt, decrypt, hash } = await import('../lib/db');

const { handle } = await import('../lib/api');

const { session } = await import('../lib/access');

after(() => db.close());

function get(path: string, cookies = '') {
  const url = new URL('/api/' + path, 'http://localhost:3000');
  return handle(
    new NextRequest(url, { headers: { cookie: cookies } }),
    url.pathname.slice(5).split('/'),
  );
}

function readCookie(response: Response, name: string) {
  return response.headers
    .getSetCookie()
    .find((part) => part.startsWith(name + '='))
    ?.split(';')[0];
}

async function start(
  cookies = '',
  intent = 'login_disk',
  returnTo = createTripDiskEntry,
) {
  const redirect = await get(
    'auth/yandex?' + new URLSearchParams({ intent, returnTo }),
    cookies,
  );
  assert.equal(redirect.status, 307);
  const url = new URL(redirect.headers.get('location')!);
  const state = url.searchParams.get('state')!;
  const browser = readCookie(redirect, 'ta_oauth')!;
  return { url, state, browser };
}

function finish(state: string, cookies: string, query = 'code=fixture') {
  return get(
    'auth/callback?state=' + encodeURIComponent(state) + '&' + query,
    cookies,
  );
}

function assertFailure(response: Response, reason: string) {
  const url = new URL(response.headers.get('location')!);
  assert.equal(response.status, 307);
  assert.equal(url.pathname, '/auth/error');
  assert.equal(url.searchParams.get('reason'), reason);
  assert.equal(url.searchParams.get('intent'), 'login_disk');
  assert.equal(url.searchParams.get('returnTo'), createTripDiskEntry);
  assert.equal(readCookie(response, 'ta_session'), undefined);
}

function mockYandex(
  t: TestContext,
  profile: { id: string; email: string },
  token: { access_token: string; scope?: string },
) {
  return t.mock.method(
    globalThis,
    'fetch',
    async (input: URL | string, init?: RequestInit) => {
      const url = new URL(input);
      switch (url.hostname) {
        case 'oauth.yandex.ru':
          assert.equal(init?.method, 'POST');
          return Response.json(token);
        case 'login.yandex.ru':
          assert.equal(
            new Headers(init?.headers).get('Authorization'),
            'OAuth ' + token.access_token,
          );
          return Response.json({
            id: profile.id,
            login: profile.id,
            default_email: profile.email,
          });
        case 'cloud-api.yandex.net':
          assert.equal(
            new Headers(init?.headers).get('Authorization'),
            'OAuth ' + token.access_token,
          );
          return Response.json({
            _embedded: {
              items: [{ name: 'Trip', type: 'dir', path: 'disk:/Trip' }],
              total: 1,
            },
          });
        default:
          assert.fail('Unexpected provider request to ' + url.hostname);
      }
    },
  );
}

test('one OAuth return creates a session and a readable Disk account from the draft', async (t) => {
  const fetch = mockYandex(
    t,
    { id: 'first-drive', email: 'first-drive@example.invalid' },
    { access_token: 'drive-token' },
  );
  const { url, state, browser } = await start(
    '',
    'login_disk',
    '//foreign.invalid',
  );
  assert.equal(url.origin, 'https://oauth.yandex.ru');
  assert.equal(
    url.searchParams.get('scope'),
    'login:info login:email cloud_api:disk.read',
  );
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  const result = await finish(state, browser);
  assert.equal(
    result.headers.get('location'),
    'http://localhost:3000' + createTripDiskEntry + oauthRegistrationHash,
  );
  assert.equal(fetch.mock.callCount(), 2);
  const request = new URLSearchParams(
    fetch.mock.calls[0].arguments[1]?.body as URLSearchParams,
  );
  assert.equal(request.get('code'), 'fixture');
  assert.equal(
    url.searchParams.get('code_challenge'),
    Buffer.from(hash(request.get('code_verifier')!), 'hex').toString(
      'base64url',
    ),
  );
  const cookie = readCookie(result, 'ta_session')!;
  const { user } = await (await get('me', cookie)).json();
  const { accounts } = await (await get('accounts', cookie)).json();
  assert.deepEqual(accounts, [
    { id: user.yandexAccountId, label: 'first-drive' },
  ]);
  const { folders } = await (
    await get('accounts/' + user.yandexAccountId + '/folders', cookie)
  ).json();
  assert.deepEqual(folders, [{ name: 'Trip', path: 'disk:/Trip' }]);
  const { profileCompletion } = await (await get('invitations', cookie)).json();
  assert.equal(profileCompletion, 'profile-completion');
  await finish(state, browser);
  assert.equal(fetch.mock.callCount(), 3);
});

test('combined OAuth resumes an existing identity and normal sign-in preserves its Disk token', async (t) => {
  const profile = {
    id: 'returning-drive',
    email: 'returning-drive@example.invalid',
  };
  const token = { access_token: 'login-only', scope: 'login:info login:email' };
  mockYandex(t, profile, token);
  const initial = await start('', 'login', '/');
  const first = await finish(initial.state, initial.browser);
  const { user } = await (
    await get('me', readCookie(first, 'ta_session'))
  ).json();
  assert.equal(user.yandexAccountId, null);
  const blocked = await start();
  assertFailure(await finish(blocked.state, blocked.browser), 'invalid_scope');
  token.access_token = 'with-disk';
  token.scope += ' cloud_api:disk.read';
  const reconnect = await start();
  const combined = await finish(reconnect.state, reconnect.browser);
  assert.equal(
    combined.headers.get('location'),
    'http://localhost:3000' + createTripDiskEntry,
  );
  const cookie = readCookie(combined, 'ta_session')!;
  const me = await (await get('me', cookie)).json();
  assert.equal(me.user.id, user.id);
  assert.ok(me.user.yandexAccountId);
  const { profileCompletion } = await (await get('invitations', cookie)).json();
  assert.equal(profileCompletion, null);
  token.access_token = 'another-login-only';
  token.scope = 'login:info login:email';
  const later = await start('', 'login', '/');
  await finish(later.state, later.browser);
  assert.equal(
    decrypt(
      one('SELECT token FROM accounts WHERE id=?', me.user.yandexAccountId)
        ?.token,
    ),
    'with-disk',
  );
});

test('combined OAuth protects existing email accounts and unrelated linked drives', async (t) => {
  const profile = {
    id: 'unlinked-drive',
    email: 'existing-email@example.invalid',
  };
  mockYandex(t, profile, { access_token: 'new-token' });
  run(
    'INSERT INTO users VALUES (?,?,?,?,?)',
    'existing-user',
    profile.email,
    'Existing',
    'password',
    Date.now(),
  );
  const before = await start();
  assertFailure(
    await finish(before.state, before.browser),
    'account_link_required',
  );
  assert.equal(
    one('SELECT 1 FROM accounts WHERE yandex_id=?', profile.id),
    undefined,
  );
  run(
    'INSERT INTO accounts (id,user_id,yandex_id,label,token,disk_enabled) VALUES (?,?,?,?,?,?)',
    'another-account',
    'existing-user',
    'another-drive',
    'Another Drive',
    encrypt('another-token'),
    1,
  );
  run(
    'INSERT INTO accounts (id,user_id,yandex_id,label,token,disk_enabled) VALUES (?,?,?,?,?,?)',
    'login-account',
    'existing-user',
    profile.id,
    'Login Only',
    encrypt('login-token'),
    0,
  );
  const attempt = await start();
  assertFailure(
    await finish(attempt.state, attempt.browser),
    'account_already_linked',
  );
  assert.equal(
    decrypt(
      one('SELECT token FROM accounts WHERE id=?', 'another-account')?.token,
    ),
    'another-token',
  );
  assert.equal(
    one('SELECT disk_enabled FROM accounts WHERE id=?', 'login-account')
      ?.disk_enabled,
    0,
  );
});

test('combined OAuth preserves retry for cancellation and rejects changed browser or account sessions', async (t) => {
  const fetch = mockYandex(
    t,
    { id: 'never-connected', email: 'never-connected@example.invalid' },
    { access_token: 'new-token' },
  );
  const attempt = await start();
  assertFailure(
    await finish(attempt.state, 'ta_oauth=unrelated'),
    'session_expired',
  );
  assertFailure(
    await finish(attempt.state, attempt.browser, 'error=access_denied'),
    'access_denied',
  );
  run(
    'INSERT INTO users VALUES (?,?,?,?,?)',
    'other-browser-user',
    null,
    'Other',
    null,
    Date.now(),
  );
  const signedIn = 'ta_session=' + session('other-browser-user');
  const next = await start();
  assertFailure(
    await finish(next.state, next.browser + '; ' + signedIn),
    'link_session_changed',
  );
  assert.equal(fetch.mock.callCount(), 0);
});
