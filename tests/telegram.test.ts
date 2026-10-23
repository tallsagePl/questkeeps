import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { db, one, all, run, decrypt } from '../lib/db';
import {
  acceptTelegramUpdate,
  deliverTelegram,
  pollTelegram,
  queueTelegramRegistration,
  telegramCall,
  TelegramError,
} from '../lib/telegram';
import { handle } from '../lib/api';

let sequence = 1;

const sent: { method: string; params: any }[] = [];

const administrator = 991122;

function message(from: number, fields: any, type = 'private') {
  return {
    update_id: sequence++,
    message: {
      message_id: sequence,
      from: { id: from },
      chat: { id: from, type },
      ...fields,
    },
  };
}

function click(from: number, data: string, type = 'private') {
  return {
    update_id: sequence++,
    callback_query: {
      id: String(sequence),
      from: { id: from },
      data,
      message: { message_id: 99, chat: { id: from, type } },
    },
  };
}

function jobs() {
  return all('SELECT payload FROM telegram_outbox').map((row) =>
    JSON.parse(decrypt(row.payload)),
  );
}

beforeEach(() => {
  run('DELETE FROM sessions');
  run('DELETE FROM accounts');
  for (const table of [
    'telegram_outbox',
    'telegram_feedback',
    'telegram_state',
    'users',
  ])
    run('DELETE FROM ' + table);
  process.env.TELEGRAM_BOT_TOKEN = 'fixture-token';
  process.env.TELEGRAM_ENABLED = 'true';
  process.env.TELEGRAM_ADMIN_ID = String(administrator);
  sent.length = 0;
  globalThis.fetch = async (url, options) => {
    sent.push({
      method: String(url).split('/').at(-1)!,
      params: JSON.parse(String(options?.body)),
    });
    return Response.json({ ok: true, result: { message_id: sent.length } });
  };
});

after(() => db.close());

test('private admin menu has two buttons; ordinary users and groups cannot access emails', () => {
  acceptTelegramUpdate(message(administrator, { text: '/start' }));
  const menu = jobs()[0];
  assert.equal(menu.params.reply_markup.inline_keyboard[0].length, 2);
  run('DELETE FROM telegram_outbox');
  run(
    'INSERT INTO users VALUES (?,?,?,?,?)',
    'u1',
    'private@example.invalid',
    'Private Name',
    null,
    Date.now(),
  );
  for (const update of [
    click(123, 'users:0'),
    click(administrator, 'users:0', 'group'),
  ])
    acceptTelegramUpdate(update);
  assert.ok(!JSON.stringify(jobs()).includes('private@example.invalid'));
  acceptTelegramUpdate(click(administrator, 'users:0'));
  const output = JSON.stringify(jobs());
  assert.ok(output.includes('private@example.invalid'));
  assert.ok(!output.includes('Private Name'));
});

test('text, captions and highest-resolution photo survive replay; stored content is encrypted', () => {
  const update = message(123, {
    caption: 'Photo feedback',
    photo: [{ file_id: 'small' }, { file_id: 'large' }],
  });
  acceptTelegramUpdate(update);
  acceptTelegramUpdate(update);
  const rows = all('SELECT * FROM telegram_feedback');
  assert.equal(rows.length, 1);
  assert.ok(!rows[0].payload.includes('Photo feedback'));
  assert.deepEqual(JSON.parse(decrypt(rows[0].payload)), {
    text: 'Photo feedback',
    method: 'sendPhoto',
    field: 'photo',
    file: 'large',
  });
  acceptTelegramUpdate(click(administrator, 'feedback:0'));
  assert.ok(
    jobs().some(
      (job) => job.method === 'sendPhoto' && job.params.photo === 'large',
    ),
  );
});

test('processing removes feedback, attachments and all delivered review messages; outsiders cannot delete', async () => {
  acceptTelegramUpdate(message(123, { text: 'Remove me' }));
  const feedback = one('SELECT id FROM telegram_feedback')!;
  acceptTelegramUpdate(click(123, 'done:' + feedback.id));
  assert.ok(one('SELECT id FROM telegram_feedback'));
  acceptTelegramUpdate(click(administrator, 'feedback:0'));
  await deliverTelegram();
  assert.ok(one('SELECT message_id FROM telegram_feedback_messages'));
  acceptTelegramUpdate(click(administrator, 'done:' + feedback.id));
  assert.equal(one('SELECT id FROM telegram_feedback'), undefined);
  assert.equal(
    one('SELECT message_id FROM telegram_feedback_messages'),
    undefined,
  );
  assert.ok(jobs().some((job) => job.method === 'deleteMessage'));
  await deliverTelegram();
  assert.ok(sent.some((job) => job.method === 'deleteMessage'));
});

test('registration API queues email-only notification atomically; login does not queue another', async () => {
  const request = (action: string) =>
    handle(
      new NextRequest('http://localhost:3000/api/auth/' + action, {
        method: 'POST',
        headers: {
          origin: 'http://localhost:3000',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          email: 'registration@example.invalid',
          password: 'Abcdef1',
          name: 'Secret Name',
        }),
      }),
      ['auth', action],
    );
  assert.equal((await request('register')).status, 200);
  assert.equal(jobs().length, 1);
  assert.ok(jobs()[0].params.text.includes('registration@example.invalid'));
  assert.ok(!jobs()[0].params.text.includes('Secret Name'));
  assert.equal((await request('login')).status, 200);
  assert.equal(jobs().length, 1);
  queueTelegramRegistration(one('SELECT id FROM users')!.id);
  assert.equal(jobs().length, 1);
});

test('rate limits preserve queued notifications and use Telegram retry_after', async () => {
  run(
    'INSERT INTO users VALUES (?,?,?,?,?)',
    'u1',
    'retry@example.invalid',
    'User',
    null,
    Date.now(),
  );
  queueTelegramRegistration('u1');
  globalThis.fetch = async () =>
    Response.json(
      { ok: false, error_code: 429, parameters: { retry_after: 60 } },
      { status: 429 },
    );
  await deliverTelegram();
  const row = one('SELECT * FROM telegram_outbox')!;
  assert.equal(row.attempts, 1);
  assert.ok(row.available >= Date.now() + 59000);
  assert.equal(row.lease_until, 0);
});

test('old review messages lose buttons when Telegram refuses deletion', async () => {
  acceptTelegramUpdate(message(123, { text: 'Old feedback' }));
  const feedback = one('SELECT id FROM telegram_feedback')!;
  run('INSERT INTO telegram_feedback_messages VALUES (?,?)', feedback.id, 555);
  acceptTelegramUpdate(click(administrator, 'done:' + feedback.id));
  globalThis.fetch = async (url, options) => {
    const method = String(url).split('/').at(-1)!;
    sent.push({ method, params: JSON.parse(String(options?.body)) });
    return method === 'deleteMessage'
      ? Response.json({ ok: false, error_code: 400 }, { status: 400 })
      : Response.json({ ok: true, result: {} });
  };
  await deliverTelegram();
  assert.ok(
    sent.some(
      (job) =>
        job.method === 'editMessageReplyMarkup' &&
        job.params.reply_markup.inline_keyboard.length === 0,
    ),
  );
  assert.equal(one('SELECT * FROM telegram_feedback'), undefined);
});

test('polling uses persisted cursor and makes no calls when disabled; network errors hide token', async () => {
  acceptTelegramUpdate(message(123, { text: 'Saved' }));
  let offset = 0;
  globalThis.fetch = async (_url, options) => {
    offset = JSON.parse(String(options?.body)).offset;
    return Response.json({ ok: true, result: [] });
  };
  await pollTelegram();
  assert.equal(offset, sequence);
  process.env.TELEGRAM_BOT_TOKEN = '';
  globalThis.fetch = async () => {
    throw Error('must not call');
  };
  await pollTelegram();
  process.env.TELEGRAM_BOT_TOKEN = 'private-token';
  await assert.rejects(
    telegramCall('getMe'),
    (error) =>
      error instanceof TelegramError &&
      !String(error).includes('private-token'),
  );
});

test('recent users and feedback paginate; long feedback remains complete and Telegram-safe', () => {
  for (let i = 0; i < 12; i++)
    run(
      'INSERT INTO users VALUES (?,?,?,?,?)',
      'user' + i,
      'person' + i + '@example.invalid',
      'Hidden Name',
      null,
      i,
    );
  acceptTelegramUpdate(click(administrator, 'users:0'));
  assert.ok(JSON.stringify(jobs()).includes('users:10'));
  acceptTelegramUpdate(click(administrator, 'users:10'));
  assert.ok(JSON.stringify(jobs()).includes('person0@example.invalid'));
  acceptTelegramUpdate(message(123, { text: 'x'.repeat(4096) }));
  acceptTelegramUpdate(click(administrator, 'feedback:0'));
  const parts = jobs().filter((job) => job.feedback);
  assert.equal(parts.length, 2);
  assert.ok(parts.every((job) => job.params.text.length <= 4096));
  assert.equal(
    parts
      .map((job) => job.params.text)
      .join('')
      .split('x').length - 1,
    4096,
  );
});

test('Yandex signup notifies once; repeated OAuth login does not', async () => {
  process.env.YANDEX_CLIENT_ID = 'fixture-client';
  globalThis.fetch = async (url) =>
    String(url).includes('oauth.yandex.ru')
      ? Response.json({ access_token: 'fixture-access', expires_in: 3600 })
      : Response.json({
          id: 'telegram-oauth-fixture',
          login: 'fixture',
          default_email: 'oauth@example.invalid',
        });
  async function login() {
    const start = await handle(
      new NextRequest('http://localhost:3000/api/auth/yandex'),
      ['auth', 'yandex'],
    );
    const state = new URL(start.headers.get('location')!).searchParams.get(
      'state',
    );
    const browser = start.headers
      .get('set-cookie')!
      .match(/ta_oauth=[^;]+/)![0];
    return handle(
      new NextRequest(
        'http://localhost:3000/api/auth/callback?state=' +
          state +
          '&code=fixture',
        { headers: { cookie: browser } },
      ),
      ['auth', 'callback'],
    );
  }
  try {
    assert.equal((await login()).status, 307);
    assert.equal(jobs().length, 1);
    assert.ok(jobs()[0].params.text.includes('oauth@example.invalid'));
    assert.equal((await login()).status, 307);
    assert.equal(jobs().length, 1);
  } finally {
    process.env.YANDEX_CLIENT_ID = '';
  }
});

test('long emoji feedback never splits surrogate pairs or loses characters', () => {
  const emoji = String.fromCodePoint(0x1f499);
  acceptTelegramUpdate(message(123, { text: emoji.repeat(4096) }));
  acceptTelegramUpdate(click(administrator, 'feedback:0'));
  const parts = jobs()
    .filter((job) => job.feedback)
    .map((job) => job.params.text);
  assert.ok(parts.every((part) => part.length <= 4096 && part.isWellFormed()));
  assert.equal(parts.join('').split(emoji).length - 1, 4096);
});
