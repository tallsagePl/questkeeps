import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';

process.env.DATABASE_PATH = './data/test-' + randomUUID() + '.sqlite';

process.env.APP_URL = 'http://localhost:3000';

const { db, run, one, all, id, hash, encrypt, decrypt } =
  await import('../lib/db');

const { handle } = await import('../lib/api');

const { session } = await import('../lib/access');

const { syncSource } = await import('../lib/sync');

const origin = 'http://localhost:3000';

const uid = id();

const mid = id();

const outsider = id();

const tid = id();

const sid = id();

const aid = id();

for (const [user, name] of [
  [uid, 'Владелец'],
  [mid, 'Участник'],
  [outsider, 'Другой пользователь'],
])
  run(
    'INSERT INTO users VALUES (?,?,?,?,?)',
    user,
    user + '@test.local',
    name,
    null,
    Date.now(),
  );

run(
  'INSERT INTO trips(id,owner_id,title,destination,start,end,created) VALUES (?,?,?,?,?,?,?)',
  tid,
  uid,
  'Грузия',
  'Тбилиси',
  '2026-10-10',
  '2026-10-18',
  Date.now(),
);

run(
  'INSERT INTO members VALUES (?,?,?,?,1)',
  tid,
  mid,
  '2026-10-12',
  '2026-10-14',
);

run(
  'INSERT INTO accounts(id,user_id,yandex_id,label,token,disk_enabled) VALUES (?,?,?,?,?,1)',
  aid,
  uid,
  'yandex-test',
  'test',
  encrypt('oauth-secret'),
);

run(
  'INSERT INTO sources(id,trip_id,user_id,account_id,path,approved) VALUES (?,?,?,?,?,1)',
  sid,
  tid,
  uid,
  aid,
  'disk:/trip',
);

const photos = [
  ['before', '2026-10-11'],
  ['during', '2026-10-13'],
  ['after', '2026-10-16'],
];

for (const [name, taken] of photos)
  run(
    'INSERT INTO media(id,source_id,trip_id,user_id,resource_id,path,name,mime,kind,taken,date_basis) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    name,
    sid,
    tid,
    uid,
    name,
    'disk:/trip/' + name + '.png',
    name,
    'image/png',
    'photo',
    taken,
    'exif',
  );

const ownerCookie = 'ta_session=' + session(uid);

const memberCookie = 'ta_session=' + session(mid);

const outsiderCookie = 'ta_session=' + session(outsider);

async function request(
  route: string,
  method = 'GET',
  body?: unknown,
  cookie = '',
  custom: Record<string, string> = {},
  background?: (task: () => Promise<void>) => void,
) {
  return handle(
    new NextRequest(origin + '/api/' + route, {
      method,
      headers: { origin, cookie, ...custom },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    route.split('?')[0].split('/'),
    background,
  );
}

after(() => db.close());

await test('права, авторизация и синхронизация', async (t) => {
  await t.test(
    'отмена загрузки превью передаётся запросу на Яндекс Диск',
    async () => {
      const { fetchMedia } = await import('../lib/yandex');
      const originalFetch = globalThis.fetch;
      const controller = new AbortController();
      try {
        globalThis.fetch = async (_url, options) => {
          assert.ok(options?.signal);
          assert.equal(options.signal.aborted, false);
          controller.abort();
          options.signal.throwIfAborted();
          throw new Error('Unreachable');
        };
        await assert.rejects(
          fetchMedia(
            { account_id: aid, path: 'disk:/trip/during.png' },
            true,
            null,
            controller.signal,
          ),
          { name: 'AbortError' },
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    },
  );
  await t.test(
    'личное избранное и название кадра с проверкой прав',
    async () => {
      assert.equal(
        (
          await request(
            'media/during/favorite',
            'PATCH',
            { favorite: true },
            memberCookie,
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await request(
            'media/during/favorite',
            'PATCH',
            { favorite: true },
            memberCookie,
          )
        ).status,
        200,
      );
      const memberData = await (
        await request('trips/' + tid, 'GET', undefined, memberCookie)
      ).json();
      assert.equal(
        memberData.media.find((m: any) => m.id === 'during').favorite,
        1,
      );
      const ownerData = await (
        await request('trips/' + tid, 'GET', undefined, ownerCookie)
      ).json();
      assert.equal(
        ownerData.media.find((m: any) => m.id === 'during').favorite,
        0,
      );
      assert.equal(
        (
          await request(
            'media/before/favorite',
            'PATCH',
            { favorite: true },
            memberCookie,
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await request(
            'media/during/favorite',
            'PATCH',
            { favorite: true },
            outsiderCookie,
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await request(
            'media/during/favorite',
            'PATCH',
            { favorite: 'yes' },
            memberCookie,
          )
        ).status,
        400,
      );
      assert.equal(
        (await request('media/during/favorite', 'PATCH', { favorite: true }))
          .status,
        401,
      );
      assert.equal(
        (
          await request(
            'media/during',
            'PATCH',
            { title: 'Закат' },
            memberCookie,
          )
        ).status,
        403,
      );
      assert.equal(
        (await request('media/during', 'PATCH', { title: '  ' }, ownerCookie))
          .status,
        400,
      );
      assert.equal(
        (
          await request(
            'media/during',
            'PATCH',
            { title: 'x'.repeat(161) },
            ownerCookie,
          )
        ).status,
        400,
      );
      assert.equal(
        (
          await request(
            'media/during',
            'PATCH',
            { title: '  Закат  ' },
            ownerCookie,
          )
        ).status,
        200,
      );
      const renamed = await (
        await request('trips/' + tid, 'GET', undefined, memberCookie)
      ).json();
      assert.equal(
        renamed.media.find((m: any) => m.id === 'during').title,
        'Закат',
      );
      assert.equal(
        one('SELECT name FROM media WHERE id=?', 'during')!.name,
        'during',
      );
      assert.equal(
        (
          await request(
            'media/during/favorite',
            'PATCH',
            { favorite: false },
            memberCookie,
          )
        ).status,
        200,
      );
      assert.equal(
        one('SELECT count(*) n FROM media_favorites WHERE user_id=?', mid)!.n,
        0,
      );
    },
  );
  await t.test(
    'пароли хешируются, сессия HttpOnly, вход работает',
    async () => {
      const email = 'registration@test.local';
      const registered = await request('auth/register', 'POST', {
        email,
        name: 'Новый участник',
        password: 'TravelPassword123',
      });
      assert.equal(registered.status, 200);
      assert.match(registered.headers.get('set-cookie') || '', /HttpOnly/);
      assert.notEqual(
        one('SELECT password FROM users WHERE email=?', email)?.password,
        'TravelPassword123',
      );
      assert.equal(
        (
          await request('auth/login', 'POST', {
            email,
            password: 'wrong-password',
          })
        ).status,
        401,
      );
      assert.equal(
        (
          await request('auth/login', 'POST', {
            email,
            password: 'TravelPassword123',
          })
        ).status,
        200,
      );
    },
  );
  await t.test(
    'владелец видит все даты, участник только свой период',
    async () => {
      assert.equal(
        (
          await (
            await request('trips/' + tid, 'GET', undefined, ownerCookie)
          ).json()
        ).media.length,
        3,
      );
      const r = await (
        await request('trips/' + tid, 'GET', undefined, memberCookie)
      ).json();
      assert.deepEqual(
        r.media.map((m: any) => m.id),
        ['during'],
      );
    },
  );
  await t.test(
    'прямой запрос оригинала не обходит даты и членство',
    async () => {
      assert.equal(
        (await request('media/before/original', 'GET', undefined, memberCookie))
          .status,
        403,
      );
      assert.equal(
        (
          await request(
            'media/during/original',
            'GET',
            undefined,
            outsiderCookie,
          )
        ).status,
        403,
      );
      assert.equal(
        (await request('trips/' + tid, 'GET', undefined, outsiderCookie))
          .status,
        403,
      );
    },
  );
  await t.test(
    'записи ограничены датами, чужие файлы нельзя менять',
    async () => {
      assert.equal(
        (
          await request(
            'trips/' + tid + '/notes',
            'POST',
            { day: '2026-10-11', text: 'Недоступно' },
            memberCookie,
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await request(
            'trips/' + tid + '/notes',
            'POST',
            { day: '2026-10-13', text: 'История' },
            memberCookie,
          )
        ).status,
        201,
      );
      assert.equal(
        (await request('media/during', 'PATCH', { hidden: true }, memberCookie))
          .status,
        403,
      );
    },
  );
  await t.test(
    'гости получают только DTO без токенов, скрытые кадры недоступны',
    async () => {
      const response = await request(
        'trips/' + tid + '/share',
        'POST',
        { enabled: true },
        ownerCookie,
      );
      const raw = (await response.json()).url.split('/').pop();
      const result = await request('share/' + raw);
      assert.equal(result.status, 200);
      const text = await result.text();
      assert.ok(!text.includes('oauth-secret'));
      assert.ok(!text.includes('importStatus'));
      assert.ok(!text.includes('share_hash'));
      assert.ok(!text.includes('password'));
      assert.equal(
        (
          await request(
            'trips/' + tid + '/share',
            'POST',
            { enabled: true },
            memberCookie,
          )
        ).status,
        403,
      );
      await request('media/during', 'PATCH', { hidden: true }, ownerCookie);
      assert.equal(
        (await request('media/during/original?share=' + raw)).status,
        404,
      );
      await request('media/during', 'PATCH', { hidden: false }, ownerCookie);
      await request(
        'trips/' + tid + '/share',
        'POST',
        { enabled: false },
        ownerCookie,
      );
      assert.equal((await request('share/' + raw)).status, 404);
    },
  );
  await t.test('приглашения одноразовые и задают период', async () => {
    const r = await request(
      'trips/' + tid + '/invite',
      'POST',
      { start: '2026-10-12', end: '2026-10-14' },
      ownerCookie,
    );
    const raw = (await r.json()).url.split('/').pop();
    assert.equal(
      (await request('invites/' + raw, 'POST', {}, outsiderCookie)).status,
      200,
    );
    assert.equal(
      one(
        'SELECT start FROM members WHERE trip_id=? AND user_id=?',
        tid,
        outsider,
      )?.start,
      '2026-10-12',
    );
    assert.equal(
      (await request('invites/' + raw, 'POST', {}, outsiderCookie)).status,
      404,
    );
    assert.equal(
      (
        await request(
          'trips/' + tid + '/invite',
          'POST',
          { start: '2026-10-09', end: '2026-10-14' },
          ownerCookie,
        )
      ).status,
      400,
    );
  });
  await t.test('CSRF блокируется', async () => {
    assert.equal(
      (
        await request('trips', 'POST', { title: 'Test' }, ownerCookie, {
          origin: 'https://evil.example',
        })
      ).status,
      403,
    );
  });
  await t.test(
    'вышедший участник сохраняет право скрыть свои кадры',
    async () => {
      const mine = id();
      run(
        'INSERT INTO media(id,source_id,trip_id,user_id,resource_id,path,name,mime,kind,taken,date_basis) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
        mine,
        sid,
        tid,
        mid,
        mine,
        'disk:/trip/mine',
        'mine',
        'image/png',
        'photo',
        '2026-10-13',
        'exif',
      );
      await request('trips/' + tid + '/leave', 'POST', {}, memberCookie);
      assert.equal(
        (await request('trips/' + tid, 'GET', undefined, memberCookie)).status,
        403,
      );
      assert.equal(
        (
          await request(
            'media/' + mine,
            'PATCH',
            { hidden: true },
            memberCookie,
          )
        ).status,
        200,
      );
      assert.equal(
        one('SELECT approved FROM sources WHERE id=?', sid)?.approved,
        1,
      );
    },
  );
  await t.test('OAuth токены шифруются с аутентификацией', () => {
    const cipher = encrypt('test-secret');
    assert.ok(!cipher.includes('test-secret'));
    assert.equal(decrypt(cipher), 'test-secret');
    const buffer = Buffer.from(cipher, 'base64');
    buffer[15] ^= 1;
    assert.throws(() => decrypt(buffer.toString('base64')));
  });
  await t.test(
    'синхронизация рекурсивная, идемпотентная, не читает другие папки',
    async () => {
      const original = globalThis.fetch;
      const calls: string[] = [];
      globalThis.fetch = (async (input: any) => {
        const url = new URL(String(input));
        const p = url.searchParams.get('path')!;
        calls.push(p);
        const items =
          p === 'disk:/trip'
            ? [
                { type: 'dir', path: 'disk:/trip/sub', name: 'sub' },
                {
                  type: 'file',
                  path: 'disk:/outside/secret',
                  name: 'secret',
                  mime_type: 'image/png',
                  created: '2026-10-13',
                },
                {
                  type: 'file',
                  path: 'disk:/trip/not-this-trip.png',
                  name: 'outside date',
                  mime_type: 'image/png',
                  created: '2020-01-01',
                },
              ]
            : [
                {
                  type: 'file',
                  resource_id: 'new-photo',
                  path: 'disk:/trip/sub/photo.png',
                  name: 'photo.png',
                  mime_type: 'image/png',
                  created: '2026-10-13',
                  revision: 1,
                },
              ];
        return Response.json({
          type: 'dir',
          _embedded: { items, total: items.length },
        });
      }) as typeof fetch;
      try {
        await syncSource(sid);
        await syncSource(sid);
        assert.equal(
          one(
            'SELECT count(*) n FROM media WHERE source_id=? AND missing=0',
            sid,
          )?.n,
          1,
        );
        assert.equal(
          one('SELECT count(*) n FROM media WHERE resource_id=?', 'new-photo')
            ?.n,
          1,
        );
        assert.equal(
          one('SELECT count(*) n FROM media WHERE name=?', 'secret')?.n,
          0,
        );
        assert.ok(calls.includes('disk:/trip/sub'));
      } finally {
        globalThis.fetch = original;
      }
    },
  );
  await t.test(
    'неудачный проход не удаляет ранее индексированные кадры',
    async () => {
      const original = globalThis.fetch;
      globalThis.fetch = (async () =>
        new Response('', { status: 503 })) as typeof fetch;
      try {
        await assert.rejects(() => syncSource(sid));
        assert.equal(
          one(
            'SELECT count(*) n FROM media WHERE source_id=? AND missing=0',
            sid,
          )?.n,
          1,
        );
        assert.ok(one('SELECT error FROM sources WHERE id=?', sid)?.error);
        assert.equal(
          one('SELECT lock_until FROM sources WHERE id=?', sid)?.lock_until,
          0,
        );
      } finally {
        globalThis.fetch = original;
      }
    },
  );
  await t.test('неодобренный источник не индексируется', async () => {
    run('UPDATE sources SET approved=0 WHERE id=?', sid);
    await assert.rejects(() => syncSource(sid));
    run('UPDATE sources SET approved=1 WHERE id=?', sid);
  });
  await t.test(
    'аватар приватный, токен остаётся на сервере, отсутствие фото даёт иконку Диска',
    async () => {
      const original = globalThis.fetch;
      let calls = 0;
      try {
        globalThis.fetch = (async (input, _init) => {
          calls++;
          assert.ok(String(input).startsWith('https://login.yandex.ru/'));
          return Response.json({});
        }) as typeof fetch;
        assert.equal(
          (
            await request(
              'accounts/' + aid + '/avatar',
              'GET',
              undefined,
              outsiderCookie,
            )
          ).status,
          403,
        );
        assert.equal(calls, 0);
        const fallback = await request(
          'accounts/' + aid + '/avatar',
          'GET',
          undefined,
          ownerCookie,
        );
        assert.equal(fallback.headers.get('content-type'), 'image/svg+xml');
        assert.ok((await fallback.text()).includes('<svg'));
        assert.match(fallback.headers.get('cache-control')!, /private/);
        globalThis.fetch = (async (input, init) => {
          if (String(input).startsWith('https://login.yandex.ru/'))
            return Response.json({
              default_avatar_id: '123/portrait',
              is_avatar_empty: false,
            });
          assert.equal(
            String(input),
            'https://avatars.yandex.net/get-yapic/123/portrait/islands-retina-middle',
          );
          assert.equal(new Headers(init?.headers).get('authorization'), null);
          return new Response(new Uint8Array([1, 2, 3]), {
            headers: { 'Content-Type': 'image/png' },
          });
        }) as typeof fetch;
        const avatar = await request(
          'accounts/' + aid + '/avatar',
          'GET',
          undefined,
          ownerCookie,
        );
        assert.equal(avatar.headers.get('content-type'), 'image/png');
        assert.equal((await avatar.arrayBuffer()).byteLength, 3);
        globalThis.fetch = (async () =>
          Response.json({
            default_avatar_id: '../../internal',
          })) as typeof fetch;
        assert.equal(
          (
            await request(
              'accounts/' + aid + '/avatar',
              'GET',
              undefined,
              ownerCookie,
            )
          ).headers.get('content-type'),
          'image/svg+xml',
        );
      } finally {
        globalThis.fetch = original;
      }
    },
  );
  await t.test('OAuth использует state, браузерную cookie и PKCE', async () => {
    process.env.YANDEX_CLIENT_ID = 'test-client';
    const r = await request(
      'auth/yandex?intent=link',
      'GET',
      undefined,
      ownerCookie,
    );
    assert.equal(r.status, 307);
    const location = new URL(r.headers.get('location')!);
    assert.equal(location.searchParams.get('code_challenge_method'), 'S256');
    assert.ok(location.searchParams.get('scope')?.includes('disk.read'));
    assert.equal(location.searchParams.get('optional_scope'), 'login:avatar');
    assert.ok(!location.searchParams.get('scope')?.includes('login:avatar'));
    const login = await request('auth/yandex', 'GET');
    const loginURL = new URL(login.headers.get('location')!);
    assert.equal(loginURL.searchParams.get('optional_scope'), null);
    assert.ok(!loginURL.searchParams.get('scope')?.includes('disk.read'));
    const state = location.searchParams.get('state')!;
    assert.equal(
      (
        await request(
          'auth/callback?state=' + state + '&code=fake',
          'GET',
          undefined,
          ownerCookie,
        )
      ).status,
      307,
    );
  });
  await t.test(
    'OAuth отказ показывает безопасную причину и сохраняет возврат',
    async () => {
      process.env.YANDEX_CLIENT_ID = 'test-client';
      for (const code of [
        'invalid_scope',
        'access_denied',
        'unauthorized_client',
        'untrusted-provider-message',
      ]) {
        const start = await request(
          'auth/yandex?intent=link&returnTo=%2F%3Fcreate%3D1',
          'GET',
          undefined,
          ownerCookie,
        );
        const state = new URL(start.headers.get('location')!).searchParams.get(
          'state',
        );
        const browser = start.headers
          .get('set-cookie')!
          .match(/ta_oauth=([^;]+)/)![1];
        const response = await request(
          'auth/callback?' +
            new URLSearchParams({
              state: state!,
              error: code,
              error_description: 'private-provider-details',
            }),
          'GET',
          undefined,
          ownerCookie + '; ta_oauth=' + browser,
        );
        assert.equal(response.status, 307);
        const destination = new URL(response.headers.get('location')!);
        assert.equal(destination.pathname, '/auth/error');
        assert.equal(
          destination.searchParams.get('reason'),
          code === 'untrusted-provider-message' ? 'unknown' : code,
        );
        assert.equal(destination.searchParams.get('returnTo'), '/?create=1');
        assert.equal(destination.searchParams.get('intent'), 'link');
        assert.ok(!destination.href.includes('private-provider-details'));
        assert.equal(
          one('SELECT * FROM oauth_states WHERE hash=?', hash(state!)),
          undefined,
        );
        assert.match(response.headers.get('set-cookie')!, /Max-Age=0/);
      }
    },
  );
  await t.test(
    'OAuth callback подключает Диск, повторный вход сохраняет его токен',
    async () => {
      const original = globalThis.fetch;
      let issued = 'disk-token';
      globalThis.fetch = (async (input: any) =>
        String(input).includes('oauth.yandex.ru')
          ? Response.json({
              access_token: issued,
              refresh_token: 'refresh',
              expires_in: 3600,
            })
          : Response.json({
              id: 'extra-account',
              login: 'extra',
              display_name: 'Друг',
            })) as typeof fetch;
      try {
        const start = await request(
          'auth/yandex?intent=link&returnTo=%2Fjoin%2Ftest',
          'GET',
          undefined,
          memberCookie,
        );
        const state = new URL(start.headers.get('location')!).searchParams.get(
          'state',
        );
        const browser = start.headers
          .get('set-cookie')!
          .match(/ta_oauth=([^;]+)/)![1];
        const callback = await request(
          'auth/callback?state=' + state + '&code=test',
          'GET',
          undefined,
          memberCookie + '; ta_oauth=' + browser,
        );
        assert.equal(callback.status, 307, await callback.text());
        const account = one(
          'SELECT * FROM accounts WHERE yandex_id=?',
          'extra-account',
        )!;
        assert.equal(account.disk_enabled, 1);
        assert.equal(decrypt(account.token), 'disk-token');
        issued = 'login-only-token';
        const login = await request('auth/yandex');
        const state2 = new URL(login.headers.get('location')!).searchParams.get(
          'state',
        );
        const browser2 = login.headers
          .get('set-cookie')!
          .match(/ta_oauth=([^;]+)/)![1];
        assert.equal(
          (
            await request(
              'auth/callback?state=' + state2 + '&code=test',
              'GET',
              undefined,
              'ta_oauth=' + browser2,
            )
          ).status,
          307,
        );
        assert.equal(
          decrypt(
            one('SELECT token FROM accounts WHERE id=?', account.id)!.token,
          ),
          'disk-token',
        );
      } finally {
        globalThis.fetch = original;
      }
    },
  );
  await t.test(
    'папка участника требует одобрения владельца и индексирует его даты',
    async () => {
      run(
        'UPDATE members SET active=1 WHERE trip_id=? AND user_id=?',
        tid,
        mid,
      );
      const accountId = id();
      run(
        'INSERT INTO accounts(id,user_id,yandex_id,label,token,disk_enabled) VALUES (?,?,?,?,?,1)',
        accountId,
        mid,
        'member-disk',
        'member',
        encrypt('member-token'),
      );
      const original = globalThis.fetch;
      globalThis.fetch = (async (input: any) => {
        const url = new URL(String(input));
        if (url.searchParams.get('limit') === '0')
          return Response.json({ type: 'dir' });
        return Response.json({
          type: 'dir',
          _embedded: {
            total: 2,
            items: [
              {
                type: 'file',
                resource_id: 'member-before',
                path: 'disk:/selected/early.png',
                name: 'early.png',
                mime_type: 'image/png',
                created: '2026-10-11',
              },
              {
                type: 'file',
                resource_id: 'member-valid',
                path: 'disk:/selected/valid.png',
                name: 'valid.png',
                mime_type: 'image/png',
                created: '2026-10-13',
              },
            ],
          },
        });
      }) as typeof fetch;
      try {
        const added = await request(
          'trips/' + tid + '/sources',
          'POST',
          { accountId, path: 'disk:/selected' },
          memberCookie,
        );
        assert.equal(added.status, 201);
        const sourceId = (await added.json()).id;
        assert.equal(
          one('SELECT approved FROM sources WHERE id=?', sourceId)?.approved,
          0,
        );
        assert.equal(
          (
            await request(
              'trips/' + tid + '/sources/' + sourceId + '/sync',
              'POST',
              {},
              memberCookie,
            )
          ).status,
          403,
        );
        assert.equal(
          (
            await request(
              'trips/' + tid + '/sources/' + sourceId,
              'PATCH',
              { approved: true },
              memberCookie,
            )
          ).status,
          403,
        );
        assert.equal(
          (
            await request(
              'trips/' + tid + '/sources/' + sourceId,
              'PATCH',
              { approved: true },
              ownerCookie,
            )
          ).status,
          200,
        );
        const result = await request(
          'trips/' + tid + '/sources/' + sourceId + '/sync',
          'POST',
          {},
          memberCookie,
        );
        assert.equal(result.status, 200);
        assert.equal((await result.json()).count, 1);
        assert.equal(
          one(
            'SELECT count(*) n FROM media WHERE resource_id=?',
            'member-before',
          )?.n,
          0,
        );
        assert.equal(
          (
            await request(
              'trips/' + tid + '/sources',
              'POST',
              { accountId: aid, path: 'disk:/stolen' },
              memberCookie,
            )
          ).status,
          403,
        );
      } finally {
        globalThis.fetch = original;
      }
    },
  );
  await t.test(
    'превью передаётся потоком с авторизацией Яндекса, без токена в браузере и на другом домене',
    async () => {
      const media = one(
        'SELECT id FROM media WHERE resource_id=?',
        'new-photo',
      )!;
      const original = globalThis.fetch;
      let redirect = false;
      let html = false;
      let calls = 0;
      globalThis.fetch = (async (input: any, init: any) => {
        calls++;
        const url = new URL(String(input));
        if (url.hostname === 'cloud-api.yandex.net')
          return Response.json({
            preview: 'https://downloader.disk.yandex.ru/preview/private',
          });
        if (url.hostname === 'downloader.disk.yandex.ru') {
          assert.equal(init.headers.Authorization, 'OAuth oauth-secret');
          if (redirect)
            return new Response(null, {
              status: 302,
              headers: {
                location: 'https://storage.yandex.net/signed-preview',
              },
            });
        } else
          assert.equal(new Headers(init.headers).get('authorization'), null);
        return new Response(new Uint8Array([1, 2, 3]), {
          headers: {
            'Content-Type': html ? 'text/html' : 'image/webp',
            'Content-Length': '3',
          },
        });
      }) as typeof fetch;
      try {
        const denied = await request(
          'media/' + media.id + '/preview',
          'GET',
          undefined,
          '',
        );
        assert.equal(denied.status, 401);
        assert.equal(calls, 0);
        const response = await request(
          'media/' + media.id + '/preview',
          'GET',
          undefined,
          memberCookie,
        );
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('content-type'), 'image/webp');
        assert.match(response.headers.get('cache-control')!, /no-store/);
        assert.equal(response.headers.get('authorization'), null);
        assert.equal((await response.arrayBuffer()).byteLength, 3);
        redirect = true;
        const redirected = await request(
          'media/' + media.id + '/preview',
          'GET',
          undefined,
          memberCookie,
        );
        assert.equal(redirected.status, 200);
        await redirected.body?.cancel();
        redirect = false;
        html = true;
        assert.equal(
          (
            await request(
              'media/' + media.id + '/preview',
              'GET',
              undefined,
              memberCookie,
            )
          ).status,
          502,
        );
      } finally {
        globalThis.fetch = original;
      }
    },
  );
  await t.test(
    'оригинал передаётся потоком с Range без раскрытия токена',
    async () => {
      const original = globalThis.fetch;
      const media = one(
        'SELECT id FROM media WHERE resource_id=?',
        'new-photo',
      )!;
      const ranges: string[] = [];
      globalThis.fetch = (async (input: any, init: any) => {
        if (String(input).includes('cloud-api.yandex.net'))
          return Response.json({
            href: 'https://downloader.disk.yandex.net/disk/signed',
          });
        ranges.push(init.headers.Range);
        return new Response(new Uint8Array([1, 2, 3]), {
          status: 206,
          headers: {
            'content-range': 'bytes 0-2/10',
            'content-length': '3',
            'accept-ranges': 'bytes',
          },
        });
      }) as typeof fetch;
      try {
        const response = await request(
          'media/' + media.id + '/original',
          'GET',
          undefined,
          memberCookie,
          { range: 'bytes=0-2' },
        );
        assert.equal(response.status, 206);
        assert.equal(response.headers.get('content-range'), 'bytes 0-2/10');
        assert.match(response.headers.get('cache-control') || '', /no-store/);
        assert.match(
          response.headers.get('content-security-policy') || '',
          /sandbox/,
        );
        assert.equal((await response.arrayBuffer()).byteLength, 3);
        assert.deepEqual(ranges, ['bytes=0-2']);
      } finally {
        globalThis.fetch = original;
      }
    },
  );
  await t.test(
    'место подтверждается рядом с GPS и получает краткий экскурс',
    async () => {
      const media = one(
        'SELECT id FROM media WHERE resource_id=?',
        'new-photo',
      )!;
      await request(
        'media/' + media.id,
        'PATCH',
        { lat: 41.7, lon: 44.8 },
        ownerCookie,
      );
      const original = globalThis.fetch;
      globalThis.fetch = (async (input: any) => {
        const url = new URL(String(input));
        if (url.searchParams.get('prop') === 'pageimages|images')
          return Response.json({
            query: {
              pages: {
                123: {
                  thumbnail: {
                    source:
                      'https://upload.wikimedia.org/wikipedia/commons/test.jpg',
                  },
                },
              },
            },
          });
        return url.searchParams.get('list') === 'geosearch'
          ? Response.json({
              query: {
                geosearch: [
                  {
                    pageid: 123,
                    title: 'Крепость',
                    lat: 41.7,
                    lon: 44.8,
                    dist: 100,
                  },
                ],
              },
            })
          : Response.json({
              query: {
                pages: {
                  124: {
                    title: 'Ближайшие ворота',
                    extract: 'Ворота старого города.',
                    coordinates: [{ lat: 41.7001, lon: 44.8, globe: 'earth' }],
                  },
                  999: {
                    title: 'Далёкое место',
                    extract: 'Описание.',
                    coordinates: [{ lat: 1, lon: 1, globe: 'earth' }],
                  },
                  123: {
                    title: 'Крепость',
                    extract: 'Историческая крепость над городом.',
                    coordinates: [{ lat: 41.7, lon: 44.8, globe: 'earth' }],
                  },
                },
              },
            });
      }) as typeof fetch;
      try {
        const suggestions = await request(
          'media/' + media.id + '/places',
          'GET',
          undefined,
          memberCookie,
        );
        assert.equal((await suggestions.json()).suggestions[0].pageid, 123);
        assert.equal(
          (
            await request(
              'media/' + media.id + '/places',
              'POST',
              { pageId: 999 },
              ownerCookie,
            )
          ).status,
          400,
        );
        assert.equal(
          (
            await request(
              'media/' + media.id + '/places',
              'POST',
              { pageId: 123 },
              ownerCookie,
            )
          ).status,
          200,
        );
        assert.equal(
          one('SELECT summary FROM confirmed_places WHERE media_id=?', media.id)
            ?.summary,
          'Историческая крепость над городом.',
        );
        const saved = one(
          'SELECT id FROM confirmed_places WHERE media_id=?',
          media.id,
        )!;
        const imageRoute =
          'media/' + media.id + '/places/' + saved.id + '/image';
        const deniedId = id();
        run(
          'INSERT INTO users VALUES (?,?,?,?,?)',
          deniedId,
          deniedId + '@test.local',
          'No access',
          null,
          Date.now(),
        );
        const deniedCookie = 'ta_session=' + session(deniedId);
        assert.equal(
          (await request(imageRoute, 'GET', undefined, deniedCookie)).status,
          403,
        );
        assert.equal((await request(imageRoute)).status, 401);
        const image = await request(imageRoute, 'GET', undefined, memberCookie);
        assert.equal(image.status, 200);
        assert.equal(
          (await image.json()).image,
          'https://upload.wikimedia.org/wikipedia/commons/test.jpg',
        );
        const additional = await request(
          'media/' + media.id + '/places',
          'POST',
          { pageId: 124 },
          ownerCookie,
        );
        assert.equal(additional.status, 200);
        const added = (await additional.json()).place;
        assert.ok(added.distance > 10 && added.distance < 12);
        assert.equal(added.title, 'Ближайшие ворота');
        assert.equal(
          one('SELECT title FROM media_titles WHERE media_id=?', media.id)
            ?.title,
          'Ближайшие ворота',
        );
        await request(
          'media/' + media.id + '/places',
          'POST',
          { pageId: 124 },
          ownerCookie,
        );
        assert.equal(
          one(
            'SELECT count(*) n FROM confirmed_places WHERE media_id=?',
            media.id,
          )!.n,
          2,
        );
        const detail = await (
          await request('trips/' + tid, 'GET', undefined, ownerCookie)
        ).json();
        assert.equal(
          detail.media.find((photo: any) => photo.id === media.id)?.title,
          'Ближайшие ворота',
        );
        run('DELETE FROM media_titles WHERE media_id=?', media.id);
        const legacy = await (
          await request('trips/' + tid, 'GET', undefined, ownerCookie)
        ).json();
        assert.equal(
          legacy.media.find((photo: any) => photo.id === media.id)?.title,
          'Ближайшие ворота',
        );
        assert.equal(
          detail.places.filter((p: any) => p.media_id === media.id).length,
          2,
        );
        assert.equal(
          (
            await request(
              'media/' + media.id + '/places/' + added.id,
              'DELETE',
              undefined,
              memberCookie,
            )
          ).status,
          403,
        );
        assert.equal(
          (
            await request(
              'media/' + media.id + '/places/unknown',
              'DELETE',
              undefined,
              ownerCookie,
            )
          ).status,
          404,
        );
        assert.equal(
          (
            await request(
              'media/' + media.id + '/places/' + added.id,
              'DELETE',
              undefined,
              ownerCookie,
            )
          ).status,
          200,
        );
        assert.equal(
          one(
            'SELECT count(*) n FROM confirmed_places WHERE media_id=?',
            media.id,
          )!.n,
          1,
        );
        assert.equal(
          (
            await request(
              'media/' + media.id + '/places/' + added.id,
              'DELETE',
              undefined,
              ownerCookie,
            )
          ).status,
          404,
        );
        const geometry = await request(
          'media/' + media.id + '/places/' + saved.id + '/geometry',
          'GET',
          undefined,
          memberCookie,
        );
        assert.equal(geometry.status, 200);
        assert.deepEqual((await geometry.json()).features, []);
        assert.equal(
          (
            await request(
              'trips/' + tid,
              'PATCH',
              { description: 'Мой рассказ' },
              memberCookie,
            )
          ).status,
          403,
        );
        assert.equal(
          (
            await request(
              'trips/' + tid,
              'PATCH',
              { description: '  Мой рассказ  ' },
              ownerCookie,
            )
          ).status,
          200,
        );
        assert.equal(
          (
            await (
              await request('trips/' + tid, 'GET', undefined, ownerCookie)
            ).json()
          ).trip.description,
          'Мой рассказ',
        );
        assert.equal(
          (
            await request(
              'trips/' + tid,
              'PATCH',
              { description: 'x'.repeat(3001) },
              ownerCookie,
            )
          ).status,
          400,
        );
        const other = one(
          'SELECT id FROM media WHERE trip_id=? AND id<>? LIMIT 1',
          tid,
          media.id,
        )!;
        assert.ok(other);
        run(
          'INSERT INTO confirmed_places(id,trip_id,media_id,title,summary,url,lat,lon,day,distance) SELECT ?,trip_id,?,title,summary,url,lat,lon,day,distance FROM confirmed_places WHERE id=?',
          id(),
          other.id,
          saved.id,
        );
        assert.equal(
          (
            await request(
              'trips/' + tid + '/places/123',
              'DELETE',
              undefined,
              memberCookie,
            )
          ).status,
          403,
        );
        assert.equal(
          (
            await request(
              'trips/' + tid + '/places/123',
              'DELETE',
              undefined,
              ownerCookie,
            )
          ).status,
          200,
        );
        assert.equal(
          one(
            'SELECT count(*) n FROM confirmed_places WHERE trip_id=? AND url=?',
            tid,
            'https://ru.wikipedia.org/?curid=123',
          )!.n,
          0,
        );
      } finally {
        globalThis.fetch = original;
      }
    },
  );
  await t.test(
    'JPEG EXIF определяет дату и GPS без сохранения оригинала',
    async () => {
      const tiff = Buffer.alloc(178);
      tiff.write('II', 0);
      tiff.writeUInt16LE(42, 2);
      tiff.writeUInt32LE(8, 4);
      function entry(
        offset: number,
        tag: number,
        type: number,
        count: number,
        value: number,
      ) {
        tiff.writeUInt16LE(tag, offset);
        tiff.writeUInt16LE(type, offset + 2);
        tiff.writeUInt32LE(count, offset + 4);
        tiff.writeUInt32LE(value, offset + 8);
      }
      tiff.writeUInt16LE(2, 8);
      entry(10, 0x8769, 4, 1, 38);
      entry(22, 0x8825, 4, 1, 56);
      tiff.writeUInt16LE(1, 38);
      entry(40, 0x9003, 2, 20, 110);
      tiff.writeUInt16LE(4, 56);
      entry(58, 1, 2, 2, 78);
      entry(70, 2, 5, 3, 130);
      entry(82, 3, 2, 2, 69);
      entry(94, 4, 5, 3, 154);
      tiff.write('2026:10:13 00:30:00\0', 110, 'ascii');
      for (const [offset, nums] of [
        [130, [41, 42, 0]],
        [154, [44, 48, 0]],
      ] as [number, number[]][]) {
        for (let i = 0; i < 3; i++) {
          tiff.writeUInt32LE(nums[i], offset + i * 8);
          tiff.writeUInt32LE(1, offset + i * 8 + 4);
        }
      }
      const payload = Buffer.concat([Buffer.from('Exif\0\0', 'ascii'), tiff]);
      const header = Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0, 0]);
      header.writeUInt16BE(payload.length + 2, 4);
      const jpeg = Buffer.concat([header, payload, Buffer.from([0xff, 0xd9])]);
      const original = globalThis.fetch;
      let requestedRange = '';
      globalThis.fetch = (async (input: any, init: any) => {
        const url = new URL(String(input));
        if (url.hostname === 'cloud-api.yandex.net') {
          if (url.pathname.endsWith('/download'))
            return Response.json({
              href: 'https://downloader.disk.yandex.net/disk/jpeg',
            });
          return Response.json({
            type: 'dir',
            _embedded: {
              total: 1,
              items: [
                {
                  type: 'file',
                  resource_id: 'jpeg-with-exif',
                  path: 'disk:/trip/exif.jpg',
                  name: 'exif.jpg',
                  mime_type: 'image/jpeg',
                  created: '2026-11-10',
                  revision: 1,
                },
              ],
            },
          });
        }
        requestedRange = init.headers.Range;
        return new Response(jpeg, { status: 206 });
      }) as typeof fetch;
      try {
        await syncSource(sid);
        const result = one(
          'SELECT * FROM media WHERE resource_id=?',
          'jpeg-with-exif',
        )!;
        assert.ok(result, 'EXIF date should put the photo within the trip');
        assert.equal(result.taken, '2026-10-13');
        assert.equal(result.date_basis, 'exif');
        assert.ok(Math.abs(result.lat - 41.7) < 0.0001);
        assert.ok(Math.abs(result.lon - 44.8) < 0.0001);
        assert.equal(requestedRange, 'bytes=0-524287');
      } finally {
        globalThis.fetch = original;
      }
    },
  );
  await t.test(
    'даты новой поездки берутся из всей выбранной папки без дат загрузки',
    async () => {
      const original = globalThis.fetch;
      const before = one('SELECT count(*) n FROM trips')!.n;
      const visited: string[] = [];
      globalThis.fetch = (async (input: any) => {
        const url = new URL(String(input));
        const path = url.searchParams.get('path')!;
        visited.push(path);
        const items =
          path === 'disk:/infer'
            ? [
                { type: 'dir', name: 'nested', path: 'disk:/infer/nested' },
                {
                  type: 'file',
                  name: 'last.png',
                  path: 'disk:/infer/last.png',
                  mime_type: 'image/png',
                  exif: { date_time: '2026-10-18T22:00:00Z' },
                },
                {
                  type: 'file',
                  name: 'outside.png',
                  path: 'disk:/other/outside.png',
                  mime_type: 'image/png',
                  exif: { date_time: '1999-01-01T00:00:00Z' },
                },
              ]
            : [
                {
                  type: 'file',
                  name: 'first.png',
                  path: 'disk:/infer/nested/first.png',
                  mime_type: 'image/png',
                  exif: { date_time: '2026-10-10T10:00:00Z' },
                },
                {
                  type: 'file',
                  name: 'no-date.png',
                  path: 'disk:/infer/nested/no-date.png',
                  mime_type: 'image/png',
                  created: '2020-01-01',
                },
              ];
        return Response.json({
          type: 'dir',
          _embedded: { items, total: items.length },
        });
      }) as typeof fetch;
      try {
        const response = await request(
          'trips/infer',
          'POST',
          {
            accountId: aid,
            path: 'disk:/infer',
            dates: true,
            destination: false,
          },
          ownerCookie,
        );
        assert.equal(response.status, 200);
        const result = await response.json();
        assert.equal(result.start, '2026-10-10');
        assert.equal(result.end, '2026-10-18');
        assert.equal(result.photoCount, 3);
        assert.equal(result.datedCount, 2);
        assert.equal(result.destination, null);
        assert.match(result.warnings.dates, /2 из 3/);
        assert.equal(one('SELECT count(*) n FROM trips')!.n, before);
        assert.deepEqual(
          visited.filter((path) => !path.endsWith('.png')),
          ['disk:/infer', 'disk:/infer/nested'],
        );
        assert.equal(
          (
            await request(
              'trips/infer',
              'POST',
              {
                accountId: aid,
                path: 'disk:/infer',
                dates: true,
                destination: true,
              },
              memberCookie,
            )
          ).status,
          403,
        );
        assert.equal(
          (
            await request(
              'trips/infer',
              'POST',
              {
                accountId: aid,
                path: 'disk:/',
                dates: true,
                destination: false,
              },
              ownerCookie,
            )
          ).status,
          400,
        );
      } finally {
        globalThis.fetch = original;
      }
    },
  );
  await t.test(
    'видео задаёт последний день, разные годы требуют ручной проверки, локальная EXIF дата не сдвигается',
    async () => {
      const original = globalThis.fetch;
      let wrongYear = false;
      globalThis.fetch = (async () =>
        Response.json({
          type: 'dir',
          _embedded: {
            total: 2,
            items: [
              {
                type: 'file',
                resource_id: 'dated-photo',
                path: 'disk:/dates/photo.jpg',
                name: 'photo.jpg',
                mime_type: 'image/jpeg',
                exif: {
                  date_time: wrongYear
                    ? '2025-10-10T23:30:00+03:00'
                    : '2026-10-10T23:30:00+03:00',
                },
              },
              {
                type: 'file',
                resource_id: 'last-video',
                path: 'disk:/dates/last.mov',
                name: 'last.mov',
                mime_type: 'video/quicktime',
                exif: { date_time: '2026-10-18T10:18:40+00:00' },
              },
            ],
          },
        })) as typeof fetch;
      try {
        const input = {
          accountId: aid,
          path: 'disk:/dates',
          dates: true,
          destination: false,
        };
        const response = await request(
          'trips/infer',
          'POST',
          input,
          ownerCookie,
        );
        const result = await response.json();
        assert.equal(result.start, '2026-10-10');
        assert.equal(result.end, '2026-10-18');
        assert.equal(result.videoCount, 1);
        assert.equal(result.photoCount, 1);
        wrongYear = true;
        const conflict = await (
          await request('trips/infer', 'POST', input, ownerCookie)
        ).json();
        assert.equal(conflict.start, null);
        assert.equal(conflict.end, null);
        assert.match(conflict.warnings.dates, /разные годы/);
        assert.deepEqual(conflict.dateYears, ['2025', '2026']);
        const { captureDay } = await import('../lib/photo-metadata');
        assert.equal(
          captureDay({} as any, {
            DateTimeOriginal: '2026:10:10 00:15:00',
            OffsetTimeOriginal: '+03:00',
          }),
          '2026-10-10',
        );
        assert.equal(
          captureDay({} as any, { DateTimeOriginal: '2026:02:31 00:00:00' }),
          null,
        );
      } finally {
        globalThis.fetch = original;
      }
    },
  );
  await t.test(
    'отсутствие EXIF и GPS возвращает пояснения вместо выдуманных значений',
    async () => {
      const original = globalThis.fetch;
      globalThis.fetch = (async (input: any) => {
        const url = new URL(String(input));
        if (url.hostname !== 'cloud-api.yandex.net')
          return new Response(
            Buffer.from(
              'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6vkAAAAAASUVORK5CYII=',
              'base64',
            ),
          );
        if (url.pathname.endsWith('/download'))
          return Response.json({
            href: 'https://downloader.disk.yandex.net/no-metadata',
          });
        return Response.json({
          type: 'dir',
          _embedded: {
            items: [
              {
                type: 'file',
                name: 'unknown.png',
                path: 'disk:/empty-exif/unknown.png',
                mime_type: 'image/png',
                created: '2026-10-10',
              },
            ],
            total: 1,
          },
        });
      }) as typeof fetch;
      try {
        const response = await request(
          'trips/infer',
          'POST',
          {
            accountId: aid,
            path: 'disk:/empty-exif',
            dates: true,
            destination: true,
          },
          ownerCookie,
        );
        const result = await response.json();
        assert.equal(result.start, null);
        assert.equal(result.end, null);
        assert.equal(result.destination, null);
        assert.match(result.warnings.dates, /нет даты съёмки/);
        assert.match(result.warnings.destination, /нет координат/);
      } finally {
        globalThis.fetch = original;
      }
    },
  );
  await t.test(
    'первый источник создаётся атомарно с поездкой, дальнейшая синхронизация даты не меняет',
    async () => {
      const original = globalThis.fetch;
      const tasks: (() => Promise<void>)[] = [];
      globalThis.fetch = (async (input: any) => {
        const url = new URL(String(input));
        return url.searchParams.get('limit') === '0'
          ? Response.json({ type: 'dir' })
          : Response.json({ type: 'dir', _embedded: { items: [], total: 0 } });
      }) as typeof fetch;
      try {
        const created = await request(
          'trips',
          'POST',
          {
            title: 'Из папки',
            destination: 'Грузия',
            start: '2026-10-10',
            end: '2026-10-18',
            source: { accountId: aid, path: 'disk:/selected-trip' },
          },
          ownerCookie,
          {},
          (task) => tasks.push(task),
        );
        assert.equal(created.status, 201);
        const result = await created.json();
        const source = one(
          'SELECT * FROM sources WHERE id=?',
          result.sourceId,
        )!;
        assert.equal(source.trip_id, result.id);
        assert.equal(source.approved, 1);
        assert.equal(tasks.length, 1);
        const beforeSync = await (
          await request('trips/' + result.id, 'GET', undefined, ownerCookie)
        ).json();
        assert.equal(beforeSync.importStatus.sourceCount, 1);
        assert.equal(beforeSync.importStatus.waiting, true);
        assert.equal(
          JSON.stringify(beforeSync).includes('disk:/selected-trip'),
          false,
        );
        await tasks[0]();
        const afterSync = await (
          await request('trips/' + result.id, 'GET', undefined, ownerCookie)
        ).json();
        assert.equal(afterSync.importStatus.waiting, false);
        assert.ok(afterSync.importStatus.lastSync > 0);
        assert.equal(
          one('SELECT start FROM trips WHERE id=?', result.id)!.start,
          '2026-10-10',
        );
        assert.equal(
          one('SELECT end FROM trips WHERE id=?', result.id)!.end,
          '2026-10-18',
        );
        const before = one('SELECT count(*) n FROM trips')!.n;
        const forbidden = await request(
          'trips',
          'POST',
          {
            title: 'Чужая папка',
            destination: 'Грузия',
            start: '2026-10-10',
            end: '2026-10-18',
            source: { accountId: aid, path: 'disk:/selected-trip' },
          },
          memberCookie,
        );
        assert.equal(forbidden.status, 403);
        assert.equal(one('SELECT count(*) n FROM trips')!.n, before);
      } finally {
        globalThis.fetch = original;
      }
    },
  );
  await t.test(
    'место определяется локально по ближайшему городу, удалённые точки не угадываются',
    async () => {
      const { closestCity } = await import('../lib/infer-trip');
      const city = closestCity(41.7151, 44.8271);
      assert.ok(city);
      assert.equal(city.country, 'GE');
      assert.equal(closestCity(0, -140), null);
    },
  );
  await t.test(
    'переводы покрывают динамические ошибки, а пользовательские данные не меняются',
    async () => {
      const { translate, localizeMessage } =
        await import('../lib/i18n/translate');
      assert.equal(
        translate('messages.incorrectEmailOrPassword', 'en'),
        'Incorrect email or password',
      );
      assert.equal(
        translate('inference.partialDates', 'en', { dated: 2, total: 3 }),
        'Dates found in 2 of 3 photos — please check the dates',
      );
      assert.equal(
        translate('validation.minLength', 'en', { count: 10 }),
        'At least 10 characters',
      );
      assert.equal(translate('dates.start', 'en'), 'Start');
      assert.equal(localizeMessage('Start', 'ru'), 'Start');
      assert.equal(
        localizeMessage(' Мой личный маршрут ', 'en'),
        ' Мой личный маршрут ',
      );
    },
  );
  await t.test(
    'фоновые проходы исключают вышедших участников, не лишая доступа к их опубликованным файлам',
    () => {
      const sql =
        'SELECT s.id FROM sources s JOIN trips t ON t.id=s.trip_id WHERE s.approved=1 AND s.lock_until<? AND (s.last_sync IS NULL OR s.last_sync<?) AND (s.user_id=t.owner_id OR EXISTS (SELECT 1 FROM members m WHERE m.trip_id=s.trip_id AND m.user_id=s.user_id AND m.active=1)) ORDER BY s.last_sync LIMIT 25';
      const source = one('SELECT id FROM sources WHERE user_id=?', mid)!;
      run(
        'UPDATE members SET active=0 WHERE trip_id=? AND user_id=?',
        tid,
        mid,
      );
      assert.equal(
        all(sql, Date.now(), Date.now()).some((row) => row.id === source.id),
        false,
      );
      assert.equal(
        one('SELECT approved FROM sources WHERE id=?', source.id)?.approved,
        1,
      );
      run(
        'UPDATE members SET active=1 WHERE trip_id=? AND user_id=?',
        tid,
        mid,
      );
    },
  );
});
