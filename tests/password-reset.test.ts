import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { hash as passwordHash, compare } from 'bcryptjs';

process.env.DATABASE_PATH = './data/reset-' + randomUUID() + '.sqlite';

const { db, one, run, decrypt, hash } = await import('../lib/db');

const { session } = await import('../lib/access');

const { handle } = await import('../lib/api');

const { queuePasswordReset, resetPassword } =
  await import('../lib/password-reset');

const { deliverEmails } = await import('../lib/email-verification');

after(() => db.close());

async function account(verified = true) {
  const id = randomUUID();
  const email = id + '@fixture.invalid';
  run(
    'INSERT INTO users VALUES (?,?,?,?,?)',
    id,
    email,
    'Reset fixture',
    await passwordHash('OldPass1', 4),
    Date.now(),
  );
  run(
    'INSERT INTO email_status VALUES (?,?,1)',
    id,
    verified ? Date.now() : null,
  );
  return { id, email };
}

function lastLink(userId: string) {
  const job = one(
    "SELECT * FROM delivery_jobs WHERE user_id=? AND kind='password-reset' AND finished IS NULL ORDER BY rowid DESC LIMIT 1",
    userId,
  )!;
  const payload = JSON.parse(decrypt(job.payload));
  const url = new URL(payload.url);
  return {
    job,
    payload,
    token: new URLSearchParams(url.hash.slice(1)).get('token')!,
  };
}

function post(path: string, data: unknown, cookie = '') {
  return handle(
    new NextRequest('http://localhost:3000/api/' + path, {
      method: 'POST',
      headers: {
        origin: 'http://localhost:3000',
        'content-type': 'application/json',
        cookie,
      },
      body: JSON.stringify(data),
    }),
    path.split('/'),
  );
}

test('requests are generic, verified-only and rate limited; email uses a one-time fragment link in the requested language', async () => {
  const verified = await account();
  const pending = await account(false);
  const oldKey = process.env.RESEND_API_KEY;
  const oldFrom = process.env.EMAIL_FROM;
  process.env.RESEND_API_KEY = 'fixture';
  process.env.EMAIL_FROM = 'Fixture <mail@fixture.invalid>';
  try {
    const accepted = await post('auth/forgot-password', {
      email: verified.email,
      language: 'en',
    });
    const unknown = await post('auth/forgot-password', {
      email: randomUUID() + '@fixture.invalid',
    });
    const unverified = await post('auth/forgot-password', {
      email: pending.email,
    });
    assert.equal(accepted.status, 202);
    assert.equal(unknown.status, 202);
    assert.equal(unverified.status, 202);
    assert.deepEqual(await accepted.json(), await unknown.json());
    assert.equal(
      one('SELECT count(*) n FROM password_resets WHERE user_id=?', pending.id)!
        .n,
      0,
    );
    const { job, payload, token } = lastLink(verified.id);
    assert.equal(new URL(payload.url).search, '');
    assert.equal(
      one('SELECT hash FROM password_resets WHERE user_id=?', verified.id)!
        .hash,
      hash(token),
    );
    assert.equal(job.payload.includes(token), false);
    assert.ok(payload.expires - Date.now() <= 30 * 60000);
    assert.ok(payload.expires - Date.now() > 29 * 60000);
    const mails: any[] = [];
    await deliverEmails(async (mail) => {
      mails.push(mail);
    });
    assert.equal(mails.length, 1);
    assert.equal(mails[0].subject, 'Reset your QuestKeeps password');
    assert.ok(mails[0].text.includes('30 minutes'));
    assert.ok(mails[0].html.includes('cid:questkeeps-logo'));
    await post('auth/forgot-password', { email: verified.email });
    await post('auth/forgot-password', { email: verified.email });
    assert.equal(
      (await post('auth/forgot-password', { email: verified.email })).status,
      429,
    );
  } finally {
    if (oldKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = oldKey;
    if (oldFrom === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = oldFrom;
  }
});

test('new requests invalidate old links; expiration and credential changes do not consume sessions', async () => {
  const user = await account();
  queuePasswordReset(user.email, 'ru');
  const first = lastLink(user.id);
  queuePasswordReset(user.email, 'ru');
  const second = lastLink(user.id);
  assert.notEqual(first.token, second.token);
  session(user.id);
  await assert.rejects(resetPassword(first.token, 'NewPass1'));
  assert.equal(
    one('SELECT count(*) n FROM sessions WHERE user_id=?', user.id)!.n,
    1,
  );
  run('UPDATE password_resets SET expires=0 WHERE user_id=?', user.id);
  await assert.rejects(resetPassword(second.token, 'NewPass1'));
  queuePasswordReset(user.email, 'ru');
  const third = lastLink(user.id);
  run(
    'UPDATE users SET password=? WHERE id=?',
    await passwordHash('Changed1', 4),
    user.id,
  );
  await assert.rejects(resetPassword(third.token, 'NewPass1'));
  assert.equal(
    one('SELECT count(*) n FROM sessions WHERE user_id=?', user.id)!.n,
    1,
  );
});

test('one concurrent reset wins, revokes every old session, preserves other users and requires the new password', async () => {
  const user = await account();
  const other = await account();
  const oldSession = session(user.id);
  session(user.id);
  session(other.id);
  queuePasswordReset(user.email, 'ru');
  const { token } = lastLink(user.id);
  const outcomes = await Promise.allSettled([
    resetPassword(token, 'NewPass1'),
    resetPassword(token, 'NewPass1'),
  ]);
  assert.equal(
    outcomes.filter((result) => result.status === 'fulfilled').length,
    1,
  );
  assert.equal(
    one('SELECT count(*) n FROM sessions WHERE user_id=?', user.id)!.n,
    0,
  );
  assert.equal(
    one('SELECT count(*) n FROM sessions WHERE user_id=?', other.id)!.n,
    1,
  );
  assert.equal(
    one('SELECT count(*) n FROM password_resets WHERE user_id=?', user.id)!.n,
    0,
  );
  assert.ok(
    await compare(
      'NewPass1',
      one('SELECT password FROM users WHERE id=?', user.id)!.password,
    ),
  );
  const me = await handle(
    new NextRequest('http://localhost:3000/api/me', {
      headers: { cookie: 'ta_session=' + oldSession },
    }),
    ['me'],
  );
  assert.equal((await me.json()).user, null);
  assert.equal(
    (await post('auth/login', { email: user.email, password: 'OldPass1' }))
      .status,
    401,
  );
  assert.equal(
    (await post('auth/login', { email: user.email, password: 'NewPass1' }))
      .status,
    200,
  );
  await assert.rejects(resetPassword(token, 'Another1'));
});
