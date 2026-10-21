import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { NextRequest } from 'next/server';
process.env.DATABASE_PATH = './data/profile-' + randomUUID() + '.sqlite';
process.env.APP_URL = 'http://localhost:3000';
const { db, run, one, id, encrypt } = await import('../lib/db');
const { handle } = await import('../lib/api');
const { session } = await import('../lib/access');
const { accountToken } = await import('../lib/yandex');
const { syncDue } = await import('../lib/sync');
const uid = id(),
  other = id(),
  aid = id();
for (const user of [uid, other])
  run(
    'INSERT INTO users VALUES (?,?,?,?,?)',
    user,
    user + '@test.local',
    'Before',
    null,
    Date.now(),
  );
run(
  'INSERT INTO accounts(id,user_id,yandex_id,label,token,refresh,disk_enabled) VALUES (?,?,?,?,?,?,1)',
  aid,
  uid,
  'yandex-profile',
  'Yandex',
  encrypt('token'),
  encrypt('refresh'),
);
const cookie = 'ta_session=' + session(uid),
  stranger = 'ta_session=' + session(other);
async function request(
  path: string,
  method = 'GET',
  data?: unknown,
  auth = cookie,
  raw = false,
  type = 'application/json',
) {
  return handle(
    new NextRequest('http://localhost:3000/api/' + path, {
      method,
      headers: {
        origin: 'http://localhost:3000',
        cookie: auth,
        'content-type': type,
      },
      body:
        data === undefined
          ? undefined
          : raw
            ? (data as any)
            : JSON.stringify(data),
    }),
    path.split('?')[0].split('/'),
  );
}
after(() => db.close());
test('профиль: никнейм, фото с приоритетом над Яндексом и приватность', async () => {
  const changed = await request('me', 'PATCH', { name: '  Explorer  ' });
  assert.equal(changed.status, 200);
  assert.equal((await changed.json()).user.name, 'Explorer');
  assert.equal((await request('me', 'PATCH', { name: '  ' })).status, 400);
  assert.equal(
    (await request('me', 'PATCH', { name: 'a'.repeat(81) })).status,
    400,
  );
  assert.equal(one('SELECT name FROM users WHERE id=?', other)!.name, 'Before');
  const photo = await sharp({
    create: { width: 40, height: 60, channels: 3, background: '#ff8822' },
  })
    .png()
    .toBuffer();
  const upload = await request(
    'me/avatar',
    'PUT',
    photo,
    cookie,
    true,
    'image/png',
  );
  assert.equal(upload.status, 200);
  const profile = (await upload.json()).user;
  assert.ok(profile.avatarVersion);
  const publicPhoto = await request(
    'profiles/' + profile.username + '/avatar',
    'GET',
    undefined,
    '',
  );
  assert.equal(publicPhoto.status, 200);
  assert.equal(publicPhoto.headers.get('content-type'), 'image/webp');
  assert.ok((await publicPhoto.arrayBuffer()).byteLength > 0);
  assert.equal(profile.yandexAccountId, aid);
  const previousFetch = globalThis.fetch;
  let external = 0;
  globalThis.fetch = (async (input: any) => {
    external++;
    return String(input).includes('login.yandex.ru')
      ? Response.json({ default_avatar_id: '123/picture' })
      : new Response(new Uint8Array([7, 8]), {
          headers: { 'Content-Type': 'image/png' },
        });
  }) as typeof fetch;
  try {
    const own = await request('me/avatar');
    assert.equal(own.headers.get('content-type'), 'image/webp');
    const meta = await sharp(Buffer.from(await own.arrayBuffer())).metadata();
    assert.equal(meta.width, 512);
    assert.equal(meta.height, 512);
    assert.equal(external, 0);
    const disk = await request('accounts/' + aid + '/avatar');
    assert.equal(disk.headers.get('content-type'), 'image/png');
    assert.equal(external, 2);
    assert.equal(
      (await request('me/avatar', 'GET', undefined, stranger)).status,
      404,
    );
    assert.equal(
      (await request('me/avatar', 'GET', undefined, '')).status,
      401,
    );
    assert.equal((await request('me/avatar', 'DELETE')).status, 200);
    assert.equal(
      one('SELECT user_id FROM user_avatars WHERE user_id=?', uid),
      undefined,
    );
    assert.equal(
      (await request('me/avatar')).headers.get('content-type'),
      'image/png',
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
  assert.equal(
    (await request('me/avatar', 'PUT', '<svg/>', cookie, true, 'image/svg+xml'))
      .status,
    400,
  );
  assert.equal(
    (
      await request(
        'me/avatar',
        'PUT',
        'not an image',
        cookie,
        true,
        'image/png',
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await request(
        'me/avatar',
        'PUT',
        Buffer.alloc(5 * 1024 * 1024 + 1),
        cookie,
        true,
        'image/png',
      )
    ).status,
    413,
  );
});
test('второй Яндекс не подключается, повторное подключение своего доступно', async () => {
  process.env.YANDEX_CLIENT_ID = 'test-client';
  let profileId = 'another-yandex';
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: any) =>
    String(input).includes('oauth.yandex.ru')
      ? Response.json({ access_token: 'new-token', expires_in: 3600 })
      : Response.json({ id: profileId, login: 'Yandex' })) as typeof fetch;
  try {
    async function link() {
      const start = await request('auth/yandex?intent=link');
      const state = new URL(start.headers.get('location')!).searchParams.get(
        'state',
      );
      const browser = start.headers
        .get('set-cookie')!
        .match(/ta_oauth=([^;]+)/)![1];
      return request(
        'auth/callback?state=' + state + '&code=test',
        'GET',
        undefined,
        cookie + '; ta_oauth=' + browser,
      );
    }
    const blocked = await link();
    assert.equal(blocked.status, 307);
    assert.equal(
      new URL(blocked.headers.get('location')!).searchParams.get('reason'),
      'account_already_linked',
    );
    assert.equal(
      one(
        'SELECT count(*) count FROM accounts WHERE user_id=? AND disk_enabled=1',
        uid,
      )!.count,
      1,
    );
    profileId = 'yandex-profile';
    assert.equal((await link()).status, 307);
  } finally {
    globalThis.fetch = original;
  }
});
test('отключение удаляет токены, сохраняет историю и останавливает синхронизацию', async () => {
  const trip = id(),
    source = id();
  run(
    'INSERT INTO trips(id,owner_id,title,destination,start,end,created) VALUES (?,?,?,?,?,?,?)',
    trip,
    uid,
    'Trip',
    'Place',
    '2026-10-01',
    '2026-10-02',
    Date.now(),
  );
  run(
    'INSERT INTO sources(id,trip_id,user_id,account_id,path,approved) VALUES (?,?,?,?,?,1)',
    source,
    trip,
    uid,
    aid,
    'disk:/trip',
  );
  assert.equal(
    (await request('accounts/' + aid, 'DELETE', undefined, stranger)).status,
    403,
  );
  const response = await request('accounts/' + aid, 'DELETE');
  assert.equal(response.status, 200);
  assert.equal((await response.json()).user.yandexAccountId, null);
  const account = one('SELECT * FROM accounts WHERE id=?', aid)!;
  assert.equal(account.token, '');
  assert.equal(account.refresh, null);
  assert.equal(account.disk_enabled, 0);
  assert.ok(one('SELECT id FROM trips WHERE id=?', trip));
  assert.ok(one('SELECT id FROM sources WHERE id=?', source));
  await assert.rejects(() => accountToken(aid));
  assert.deepEqual(await syncDue(), []);
  assert.deepEqual((await (await request('accounts')).json()).accounts, []);
  assert.equal((await request('accounts/' + aid + '/avatar')).status, 403);
});
