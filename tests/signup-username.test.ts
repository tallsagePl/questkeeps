import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { handle } from '../lib/api';
import { db, one } from '../lib/db';

after(() => db.close());

const request = (path: string, data: Record<string, string | undefined>) =>
  handle(
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

const password = 'TravelPassword123';

test('registration reserves a chosen handle and signs in with it', async () => {
  const result = await request('auth/register', {
    email: 'signup-handle@example.test',
    name: 'Гость',
    password,
    username: ' @Trip_26 ',
  });
  assert.equal(result.status, 200);
  const { user } = await result.json();
  assert.equal(user.username, 'trip_26');
  assert.equal(
    one('SELECT username FROM user_handles WHERE user_id=?', user.id)?.username,
    'trip_26',
  );
  const login = await request('auth/login', { email: '@Trip_26', password });
  assert.equal(login.status, 200);
  assert.equal((await login.json()).user.id, user.id);
});

test('competing registrations reserve a username for exactly one account', async () => {
  const emails = ['first-claim@example.test', 'second-claim@example.test'];
  const submitted = await Promise.all(
    emails.map((email, index) =>
      request('auth/register', {
        email,
        password,
        username: index ? '@Shared_HANDLE' : 'shared_handle',
      }),
    ),
  );
  assert.deepEqual(
    submitted.map((response) => response.status).sort(),
    [200, 409],
  );
  const rejected = submitted.findIndex((response) => response.status === 409);
  assert.equal(
    (await submitted[rejected].json()).fieldErrorsTranslations.username.key,
    'errors.usernameTaken',
  );
  assert.equal(
    one('SELECT 1 FROM users WHERE email=?', emails[rejected]),
    undefined,
  );
});

test('registration rejects invalid names and lets old clients omit a username', async () => {
  const invalid = await request('auth/register', {
    email: 'invalid-handle@example.test',
    password,
    username: '@неподходит',
  });
  assert.equal(invalid.status, 400);
  assert.equal(
    (await invalid.json()).fieldErrorsTranslations.username.key,
    'auth.usernameFormat',
  );
  assert.equal(
    one('SELECT 1 FROM users WHERE email=?', 'invalid-handle@example.test'),
    undefined,
  );

  for (const [index, value] of [{}, { username: '' }].entries()) {
    const automatic = await request('auth/register', {
      email: 'automatic-handle-' + index + '@example.test',
      name: 'Путешественник',
      password,
      ...value,
    });
    assert.equal(automatic.status, 200);
    assert.match((await automatic.json()).user.username, /^user_[a-f0-9]{8}$/);
  }
});

test('a chosen username is reserved while email confirmation is pending', async () => {
  const previous = {
    required: process.env.EMAIL_VERIFICATION_REQUIRED,
    key: process.env.RESEND_API_KEY,
    from: process.env.EMAIL_FROM,
  };
  process.env.EMAIL_VERIFICATION_REQUIRED = 'true';
  process.env.RESEND_API_KEY = 'fixture-key';
  process.env.EMAIL_FROM = 'QuestKeeps <noreply@example.test>';
  try {
    const email = 'verification-handle@example.test';
    const response = await request('auth/register', {
      email,
      password,
      username: 'verify_handle',
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).verificationRequired, true);
    assert.equal(response.headers.get('set-cookie'), null);
    assert.equal(
      one(
        'SELECT h.username FROM users u JOIN user_handles h ON h.user_id=u.id WHERE u.email=?',
        email,
      )?.username,
      'verify_handle',
    );
    const duplicate = await request('auth/register', {
      email: 'verification-duplicate@example.test',
      password,
      username: '@Verify_Handle',
    });
    assert.equal(duplicate.status, 409);
  } finally {
    process.env.EMAIL_VERIFICATION_REQUIRED = previous.required ?? '';
    process.env.RESEND_API_KEY = previous.key ?? '';
    process.env.EMAIL_FROM = previous.from ?? '';
  }
});
