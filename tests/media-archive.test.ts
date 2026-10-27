import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { NextRequest } from 'next/server';

process.env.DATABASE_PATH = './data/media-archive-' + randomUUID() + '.sqlite';

process.env.APP_URL = 'http://localhost:3000';

process.env.TOKEN_ENCRYPTION_KEY = '34'.repeat(32);

const { db, run, one, encrypt, hash } = await import('../lib/db');

const { handle } = await import('../lib/api');

const { session } = await import('../lib/access');

const { syncSource } = await import('../lib/sync');

after(() => db.close());

test('rotation persists through sync; archive removal survives reconnects without deleting the original', async () => {
  for (const user of ['author', 'member'])
    run(
      'INSERT INTO users VALUES (?,?,?,?,?)',
      user,
      user + '@fixture.invalid',
      user,
      null,
      Date.now(),
    );
  run(
    'INSERT INTO trips(id,owner_id,title,destination,start,end,share_hash,created) VALUES (?,?,?,?,?,?,?,?)',
    'trip',
    'author',
    'Fixture',
    'Fixture',
    '2026-10-10',
    '2026-10-18',
    hash('guest'),
    Date.now(),
  );
  run(
    'INSERT INTO members(trip_id,user_id,start,end) VALUES (?,?,?,?)',
    'trip',
    'member',
    '2026-10-10',
    '2026-10-18',
  );
  run(
    'INSERT INTO accounts(id,user_id,yandex_id,label,token,disk_enabled) VALUES (?,?,?,?,?,1)',
    'account',
    'author',
    'fixture-yandex',
    'Fixture',
    encrypt('dummy'),
  );
  run(
    'INSERT INTO sources(id,trip_id,user_id,account_id,path,approved) VALUES (?,?,?,?,?,1)',
    'source',
    'trip',
    'author',
    'account',
    'disk:/fixture',
  );
  run(
    'INSERT INTO media(id,source_id,trip_id,user_id,resource_id,path,name,mime,kind,taken,date_basis) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    'photo',
    'source',
    'trip',
    'author',
    'resource',
    'disk:/fixture/a.png',
    'a.png',
    'image/png',
    'photo',
    '2026-10-13T12:00:00',
    'created',
  );
  const author = 'ta_session=' + session('author');
  const member = 'ta_session=' + session('member');
  const api = (path: string, cookie = '', method = 'GET', input?: unknown) =>
    handle(
      new NextRequest('http://localhost:3000/api/' + path, {
        method,
        headers: { cookie, origin: 'http://localhost:3000' },
        body: input === undefined ? undefined : JSON.stringify(input),
      }),
      path.split('?')[0].split('/'),
    );
  assert.equal(
    (await api('media/photo', member, 'PATCH', { rotation: 90 })).status,
    403,
  );
  assert.equal((await api('media/photo', member, 'DELETE')).status, 403);
  assert.equal((await api('media/photo', '', 'DELETE')).status, 401);
  assert.equal(
    (await api('media/photo', author, 'PATCH', { rotation: 45 })).status,
    400,
  );
  for (const rotation of [90, 180, 270, 0, 270]) {
    assert.equal(
      (await api('media/photo', author, 'PATCH', { rotation })).status,
      200,
    );
    assert.equal(
      (await (await api('trips/trip', member)).json()).media[0].rotation,
      rotation,
    );
  }
  const originalFetch = globalThis.fetch;
  const methods: string[] = [];
  globalThis.fetch = (async (_input, init) => {
    methods.push(init?.method || 'GET');
    return Response.json({
      type: 'dir',
      _embedded: {
        total: 1,
        items: [
          {
            type: 'file',
            resource_id: 'resource',
            path: 'disk:/fixture/a.png',
            name: 'a.png',
            mime_type: 'image/png',
            created: '2026-10-13',
            revision: 1,
          },
        ],
      },
    });
  }) as typeof fetch;
  try {
    await syncSource('source');
    assert.equal(
      one('SELECT rotation FROM media WHERE id=?', 'photo')?.rotation,
      270,
    );
    run('INSERT INTO media_titles VALUES (?,?)', 'photo', 'Title');
    run('INSERT INTO media_favorites VALUES (?,?)', 'member', 'photo');
    run(
      'INSERT INTO confirmed_places(id,trip_id,media_id,title,summary,url,lat,lon,day) VALUES (?,?,?,?,?,?,?,?,?)',
      'place',
      'trip',
      'photo',
      'Place',
      'Fixture',
      'https://ru.wikipedia.org/?curid=123',
      41,
      29,
      '2026-10-13',
    );
    assert.equal((await api('media/photo', author, 'DELETE')).status, 200);
    assert.equal(one('SELECT id FROM media WHERE id=?', 'photo'), undefined);
    assert.equal(one('SELECT count(*) n FROM confirmed_places')?.n, 0);
    assert.equal((await api('media/photo/original', member)).status, 404);
    assert.equal((await api('my-media/photo/preview', author)).status, 404);
    assert.equal((await api('media/photo/preview?share=guest')).status, 404);
    assert.equal((await (await api('share/guest')).json()).media.length, 0);
    assert.equal((await syncSource('source')).count, 0);
    run('DELETE FROM sources WHERE id=?', 'source');
    run(
      'INSERT INTO sources(id,trip_id,user_id,account_id,path,approved) VALUES (?,?,?,?,?,1)',
      'reconnected',
      'trip',
      'author',
      'account',
      'disk:/fixture',
    );
    assert.equal((await syncSource('reconnected')).count, 0);
    assert.equal(one('SELECT count(*) n FROM media')?.n, 0);
    assert.equal(one('SELECT count(*) n FROM media_exclusions')?.n, 1);
    assert.deepEqual(db.pragma('foreign_key_check'), []);
    // A retained schema-8 app can keep syncing during rollout/rollback. The
    // database trigger must enforce exclusions even without the new sync code.
    run(
      'INSERT INTO media(id,source_id,trip_id,user_id,resource_id,path,name,mime,kind,taken,date_basis) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      'legacy-import',
      'reconnected',
      'trip',
      'author',
      'resource',
      'disk:/fixture/a.png',
      'a.png',
      'image/png',
      'photo',
      '2026-10-13T12:00:00',
      'created',
    );
    assert.equal(one('SELECT count(*) n FROM media')?.n, 0);
    run('UPDATE media_exclusions SET created=123');
    run(
      'INSERT INTO notification_state VALUES (?,?,?)',
      'author',
      JSON.stringify({ fixture: 'preserved' }),
      123,
    );
    for (const target of [8, 9, 8]) {
      const result = spawnSync(
        process.platform === 'win32' ? 'python' : 'python3',
        [
          'deploy/media-archive-schema.py',
          process.env.DATABASE_PATH!,
          String(target),
        ],
        { encoding: 'utf8', windowsHide: true },
      );
      assert.equal(result.status, 0, result.stderr);
      assert.equal(db.pragma('user_version', { simple: true }), target);
      assert.equal(one('SELECT created FROM media_exclusions')?.created, 123);
    }
    const { migrate } = await import('../lib/migrations');
    migrate(db);
    assert.equal(one('SELECT created FROM media_exclusions')?.created, 123);
    assert.equal(db.pragma('user_version', { simple: true }), 10);
    assert.equal(
      one('SELECT snapshot FROM notification_state WHERE user_id=?', 'author')
        ?.snapshot,
      JSON.stringify({ fixture: 'preserved' }),
    );
    assert.ok(methods.length > 0);
    assert.ok(methods.every((method) => method === 'GET'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
