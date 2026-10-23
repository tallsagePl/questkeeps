import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { NextRequest } from 'next/server';
import { migrate } from '../lib/migrations';
import { baseline } from '../lib/migrations/001-baseline';
import { validRegistrationPassword } from '../lib/password-policy';

const { db, one, all, decrypt, hash } = await import('../lib/db');

const { handle } = await import('../lib/api');

const { queueVerification, deliverEmails, confirmEmail, emailPending } =
  await import('../lib/email-verification');

after(() => db.close());

async function request(
  path: string,
  data?: unknown,
  cookie = '',
  method = data === undefined ? 'GET' : 'POST',
) {
  return handle(
    new NextRequest('http://localhost:3000/api/' + path, {
      method,
      headers: {
        origin: 'http://localhost:3000',
        'content-type': 'application/json',
        cookie,
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    }),
    path.split('?')[0].split('/'),
  );
}

function sessionCookie(response: Response) {
  return response.headers.get('set-cookie')!.match(/ta_session=[^;]+/)![0];
}

test('numbered migrations preserve legacy records, apply once, and reject newer schemas', () => {
  const legacy = new Database(':memory:');
  legacy.pragma('foreign_keys=ON');
  baseline(legacy);
  legacy.pragma('user_version=1');
  legacy
    .prepare('INSERT INTO users VALUES (?,?,?,?,?)')
    .run('legacy', 'legacy@example.invalid', 'Legacy', 'hashed-fixture', 123);
  for (const hidden of [0, 1])
    legacy
      .prepare(
        'INSERT INTO media(id,resource_id,path,name,mime,kind,taken,date_basis,hidden) VALUES (?,?,?,?,?,?,?,?,?)',
      )
      .run(
        'legacy-photo-' + hidden,
        'resource-' + hidden,
        'disk:/a.jpg',
        'a.jpg',
        'image/jpeg',
        'photo',
        '2026-10-13',
        'manual',
        hidden,
      );
  migrate(legacy);
  migrate(legacy);
  assert.deepEqual(
    legacy
      .prepare('SELECT hidden,hidden_from_guests FROM media ORDER BY hidden')
      .all(),
    [
      { hidden: 0, hidden_from_guests: 0 },
      { hidden: 1, hidden_from_guests: 0 },
    ],
  );

  assert.equal(legacy.pragma('user_version', { simple: true }), 5);
  assert.equal(
    (legacy.prepare('SELECT count(*) n FROM schema_migrations').get() as any).n,
    5,
  );
  assert.equal(
    (legacy.prepare('SELECT password FROM users').get() as any).password,
    'hashed-fixture',
  );
  assert.deepEqual(legacy.pragma('foreign_key_check'), []);
  legacy.pragma('user_version=99');
  assert.throws(() => migrate(legacy), /newer/);
  legacy.close();
  const fresh = new Database(':memory:');
  migrate(fresh);
  assert.equal(fresh.pragma('user_version', { simple: true }), 5);
  fresh.close();
});

test('new passwords require Latin upper/lowercase and six characters; legacy login remains compatible', async () => {
  for (const value of [
    'abcde',
    'abcdef',
    'ABCDEF',
    'Abcдеф',
    'Ab cde',
    'Abcde' + 'x'.repeat(68),
  ])
    assert.equal(validRegistrationPassword(value), false, value);
  for (const value of ['Abcdef', 'Abc123!', 'LongPassword'])
    assert.equal(validRegistrationPassword(value), true, value);
  const mismatch = await request('auth/register', {
    email: 'mismatch@example.invalid',
    password: 'Abcdef',
    passwordConfirmation: 'Different',
  });
  assert.equal(mismatch.status, 400);
  const created = await request('auth/register', {
    email: 'six@example.invalid',
    password: 'Abcdef',
    passwordConfirmation: 'Abcdef',
  });
  assert.equal(created.status, 200);
  assert.equal(
    (
      await request('auth/login', {
        email: 'six@example.invalid',
        password: 'Abcdef',
      })
    ).status,
    200,
  );
});

test('required verification creates no session; encrypted queue, retries, one-use token and owner-safe resend work', async () => {
  process.env.EMAIL_VERIFICATION_REQUIRED = 'true';
  process.env.RESEND_API_KEY = 'fixture-only';
  process.env.EMAIL_FROM = 'fixture@example.invalid';
  try {
    const response = await request('auth/register', {
      email: 'pending@example.invalid',
      password: 'Abc123',
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.has('set-cookie'), false);
    assert.equal((await response.json()).verificationRequired, true);
    const user = one(
      'SELECT id FROM users WHERE email=?',
      'pending@example.invalid',
    )!;
    assert.ok(emailPending(user.id));
    const login = await request('auth/login', {
      email: 'pending@example.invalid',
      password: 'Abc123',
    });
    assert.equal(login.headers.has('set-cookie'), false);
    const job = one(
      'SELECT * FROM delivery_jobs WHERE user_id=? AND finished IS NULL',
      user.id,
    )!;
    assert.ok(!job.payload.includes('pending@example.invalid'));
    const payload = JSON.parse(decrypt(job.payload));
    const raw = payload.url.split('#token=')[1];
    assert.ok(raw);
    assert.ok(!payload.url.includes('?token='));
    assert.equal(
      one('SELECT hash FROM email_verifications WHERE user_id=?', user.id)!
        .hash,
      hash(raw),
    );
    const failed = await deliverEmails(async () => {
      throw Error('sensitive-address-and-token');
    });
    assert.equal(failed.failed, 1);
    assert.equal(
      one('SELECT last_error FROM delivery_jobs WHERE id=?', job.id)!
        .last_error,
      'delivery_failed',
    );
    let sent = 0;
    await deliverEmails(async (mail) => {
      sent++;
      assert.equal(mail.to, 'pending@example.invalid');
    });
    assert.equal(sent, 0);
    await deliverEmails(async () => {
      sent++;
    }, Date.now() + 120000);
    assert.equal(sent, 1);
    assert.equal(
      one('SELECT payload FROM delivery_jobs WHERE id=?', job.id)!.payload,
      '',
    );
    const verified = await request('auth/verify-email', { token: raw });
    assert.equal(verified.status, 200);
    assert.equal(confirmEmail(raw), false);
    assert.equal(emailPending(user.id), false);
    assert.ok(
      (
        await request('auth/login', {
          email: 'pending@example.invalid',
          password: 'Abc123',
        })
      ).headers.has('set-cookie'),
    );
    queueVerification(user.id, 'pending@example.invalid');
    const old = JSON.parse(
      decrypt(
        one(
          'SELECT payload FROM delivery_jobs WHERE user_id=? AND finished IS NULL',
          user.id,
        )!.payload,
      ),
    ).url.split('#token=')[1];
    queueVerification(user.id, 'pending@example.invalid');
    assert.equal(confirmEmail(old), false);
    assert.equal(
      all(
        'SELECT id FROM delivery_jobs WHERE user_id=? AND finished IS NULL',
        user.id,
      ).length,
      1,
    );
  } finally {
    process.env.EMAIL_VERIFICATION_REQUIRED = 'false';
    process.env.RESEND_API_KEY = '';
    process.env.EMAIL_FROM = '';
  }
});

test('linked Yandex login returns to the password account and keeps private extra email out of public profile', async () => {
  process.env.YANDEX_CLIENT_ID = 'fixture-client';
  const created = await request('auth/register', {
    name: 'Linked Fixture',
    email: 'main@example.invalid',
    password: 'Abc123',
  });
  const cookie = sessionCookie(created);
  const owner = (await created.json()).user;
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: any) =>
    String(input).includes('oauth.yandex.ru')
      ? Response.json({ access_token: 'fixture-token', expires_in: 3600 })
      : Response.json({
          id: 'provider-stable-id',
          login: 'game',
          default_email: 'game@example.invalid',
        })) as typeof fetch;
  async function oauth(intent: string, cookie = '') {
    const start = await request(
      'auth/yandex?intent=' + intent,
      undefined,
      cookie,
    );
    const state = new URL(start.headers.get('location')!).searchParams.get(
      'state',
    );
    const browser = start.headers
      .get('set-cookie')!
      .match(/ta_oauth=[^;]+/)![0];
    return request(
      'auth/callback?state=' + state + '&code=fixture',
      undefined,
      [cookie, browser].filter(Boolean).join('; '),
    );
  }
  try {
    assert.equal((await oauth('link', cookie)).status, 307);
    const account = one('SELECT * FROM accounts WHERE user_id=?', owner.id)!;
    assert.equal(account.provider_email, 'game@example.invalid');
    const linked = await oauth('login');
    assert.equal(linked.status, 307);
    const me = await request('me', undefined, sessionCookie(linked));
    const profile = (await me.json()).user;
    assert.equal(profile.id, owner.id);
    assert.deepEqual(profile.linkedEmails, ['game@example.invalid']);
    assert.equal(
      one('SELECT count(*) n FROM users WHERE email=?', 'main@example.invalid')!
        .n,
      1,
    );
    assert.equal(
      one('SELECT token FROM accounts WHERE id=?', account.id)!.token,
      account.token,
    );
    const publicResponse = await request('profiles/' + profile.username);
    assert.equal(publicResponse.status, 200);
    const publicText = await publicResponse.text();
    assert.ok(!publicText.includes('game@example.invalid'));
    assert.ok(!publicText.includes('main@example.invalid'));
    const other = await request('auth/register', {
      email: 'other@example.invalid',
      password: 'Abc123',
    });
    const conflict = await oauth('link', sessionCookie(other));
    assert.notEqual(conflict.headers.get('location'), 'http://localhost:3000/');
    assert.equal(
      one('SELECT user_id FROM accounts WHERE id=?', account.id)!.user_id,
      owner.id,
    );
  } finally {
    globalThis.fetch = original;
    process.env.YANDEX_CLIENT_ID = '';
  }
});

test('unlinked Yandex with an existing primary email cannot create a duplicate or take over the account', async () => {
  process.env.YANDEX_CLIENT_ID = 'fixture-client';
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: any) =>
    String(input).includes('oauth.yandex.ru')
      ? Response.json({ access_token: 'fixture-token' })
      : Response.json({
          id: 'unlinked-id',
          login: 'collision',
          default_email: 'main@example.invalid',
        })) as typeof fetch;
  try {
    const before = one('SELECT count(*) n FROM users')!.n;
    const start = await request('auth/yandex');
    const state = new URL(start.headers.get('location')!).searchParams.get(
      'state',
    );
    const browser = start.headers
      .get('set-cookie')!
      .match(/ta_oauth=[^;]+/)![0];
    const response = await request(
      'auth/callback?state=' + state + '&code=fixture',
      undefined,
      browser,
    );
    assert.equal(
      new URL(response.headers.get('location')!).searchParams.get('reason'),
      'account_link_required',
    );
    assert.equal(
      response.headers.get('set-cookie')?.includes('ta_session='),
      false,
    );
    assert.equal(one('SELECT count(*) n FROM users')!.n, before);
    assert.equal(
      one('SELECT id FROM accounts WHERE yandex_id=?', 'unlinked-id'),
      undefined,
    );
  } finally {
    globalThis.fetch = original;
    process.env.YANDEX_CLIENT_ID = '';
  }
});

test('Resend transport sends the configured sender and idempotency key and handles rejection', async () => {
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.RESEND_API_KEY;
  const previousFrom = process.env.EMAIL_FROM;
  process.env.RESEND_API_KEY = 'fixture-resend-key';
  process.env.EMAIL_FROM = 'QuestKeeps <noreply@mail.fixture.invalid>';
  const { sendMail } = await import('../lib/email-verification');
  let reject = false;
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), 'https://api.resend.com/emails');
    assert.equal(init?.method, 'POST');
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('authorization'), 'Bearer fixture-resend-key');
    assert.equal(headers.get('idempotency-key'), 'questkeeps/fixture-job');
    assert.deepEqual(JSON.parse(String(init?.body)), {
      from: 'QuestKeeps <noreply@mail.fixture.invalid>',
      to: ['recipient@fixture.invalid'],
      subject: 'Fixture subject',
      text: 'Fixture body',
    });
    return reject
      ? new Response('provider-private-details', { status: 403 })
      : Response.json({ id: 'fixture-message' });
  };
  const mail = {
    to: 'recipient@fixture.invalid',
    subject: 'Fixture subject',
    text: 'Fixture body',
  };
  try {
    await sendMail(mail, 'fixture-job');
    reject = true;
    await assert.rejects(sendMail(mail, 'fixture-job'), {
      message: 'Mail provider rejected delivery',
    });
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previousKey;
    if (previousFrom === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = previousFrom;
  }
});
