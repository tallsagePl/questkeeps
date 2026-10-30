import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';

process.env.DATABASE_PATH = './data/video-playback-' + randomUUID() + '.sqlite';

process.env.APP_URL = 'http://localhost:3000';

process.env.TOKEN_ENCRYPTION_KEY = '67'.repeat(32);

const { db, run, hash, encrypt } = await import('../lib/db');

const { session } = await import('../lib/access');

const { handle } = await import('../lib/api');

const { videoStore, closeVideoStore } = await import('../lib/video-jobs');

const { videoKey } = await import('../lib/video-store');

after(() => {
  closeVideoStore();
  db.close();
});

for (const user of ['owner', 'member', 'outsider'])
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
  'owner',
  'Video',
  '',
  '2026-10-10',
  '2026-10-18',
  hash('share'),
  Date.now(),
);

run(
  'INSERT INTO members(trip_id,user_id,start,end,active) VALUES (?,?,?,?,1)',
  'trip',
  'member',
  '2026-10-12',
  '2026-10-14',
);

run(
  'INSERT INTO accounts(id,user_id,yandex_id,label,token,disk_enabled) VALUES (?,?,?,?,?,1)',
  'account',
  'owner',
  'fixture',
  'Fixture',
  encrypt('dummy'),
);

run(
  'INSERT INTO sources(id,trip_id,user_id,account_id,path,approved) VALUES (?,?,?,?,?,1)',
  'source',
  'trip',
  'owner',
  'account',
  'disk:/fixture',
);

run(
  'INSERT INTO media(id,source_id,trip_id,user_id,resource_id,path,name,mime,kind,taken,date_basis,revision) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
  'movie',
  'source',
  'trip',
  'owner',
  'resource',
  'disk:/fixture/a.mov',
  'a.mov',
  'video/quicktime',
  'video',
  '2026-10-13',
  'manual',
  '1',
);

const cookies = Object.fromEntries(
  ['owner', 'member', 'outsider'].map((user) => [
    user,
    'ta_session=' + session(user),
  ]),
);

const request = (path: string, method = 'GET', cookie = '', range?: string) =>
  handle(
    new NextRequest('http://localhost:3000/api/' + path, {
      method,
      headers: {
        cookie,
        origin: 'http://localhost:3000',
        ...(range ? { Range: range } : {}),
      },
    }),
    path.split('?')[0].split('/'),
  );

test('compatible playback is queued once and Range/HEAD/poster retain all media permissions', async () => {
  videoStore().tick();
  assert.equal(
    (await request('media/movie/playback', 'POST', cookies.outsider)).status,
    403,
  );
  assert.equal(
    (await request('media/movie/playback?share=share', 'POST')).status,
    202,
  );
  assert.equal(
    (await request('media/movie/playback', 'POST', cookies.owner)).status,
    202,
  );
  const media = {
    account_id: 'account',
    resource_id: 'resource',
    path: 'disk:/fixture/a.mov',
    revision: '1',
  };
  const key = videoKey(media);
  const cache = videoStore();
  assert.equal(
    (cache.index.prepare('SELECT count(*) n FROM jobs').get() as { n: number })
      .n,
    1,
  );
  const bytes = Buffer.from('0123456789abcdefghijklmnop');
  writeFileSync(cache.file(key, 'mp4'), bytes);
  writeFileSync(cache.file(key, 'jpg'), Buffer.from('poster'));
  cache.ready(key);
  assert.equal(
    (
      await (
        await request('media/movie/playback-status', 'GET', cookies.member)
      ).json()
    ).state,
    'ready',
  );
  const head = await request('media/movie/playback?share=share', 'HEAD');
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('content-length'), String(bytes.length));
  assert.equal((await head.arrayBuffer()).byteLength, 0);
  const range = await request(
    'media/movie/playback?share=share',
    'GET',
    '',
    'bytes=2-5',
  );
  assert.equal(range.status, 206);
  assert.equal(range.headers.get('content-range'), 'bytes 2-5/' + bytes.length);
  assert.equal(await range.text(), '2345');
  const suffix = await request(
    'media/movie/playback',
    'GET',
    cookies.member,
    'bytes=-2',
  );
  assert.equal(await suffix.text(), 'op');
  assert.equal(
    (await request('media/movie/playback', 'GET', cookies.owner, 'bytes=999-'))
      .status,
    416,
  );
  const poster = await request('media/movie/poster?share=share');
  assert.equal(poster.headers.get('content-type'), 'image/jpeg');
  assert.equal(await poster.text(), 'poster');
  run('UPDATE media SET hidden_from_guests=1 WHERE id=?', 'movie');
  assert.equal((await request('media/movie/playback?share=share')).status, 404);
  run(
    'UPDATE media SET hidden_from_guests=0,revision=? WHERE id=?',
    '2',
    'movie',
  );
  assert.equal(
    (await request('media/movie/playback', 'GET', cookies.owner)).status,
    409,
  );
  run('UPDATE media SET revision=? WHERE id=?', '1', 'movie');
  run('UPDATE members SET start=? WHERE user_id=?', '2026-10-14', 'member');
  assert.equal(
    (await request('media/movie/playback', 'GET', cookies.member)).status,
    403,
  );
  run('UPDATE accounts SET disk_enabled=0 WHERE id=?', 'account');
  assert.equal(
    (await request('media/movie/playback', 'GET', cookies.owner)).status,
    409,
  );
  run('UPDATE accounts SET disk_enabled=1 WHERE id=?', 'account');
  run('UPDATE trips SET share_hash=NULL WHERE id=?', 'trip');
  assert.equal((await request('media/movie/playback?share=share')).status, 404);
  run('UPDATE media SET hidden=1 WHERE id=?', 'movie');
  const own = await request('my-media/movie/playback', 'GET', cookies.owner);
  assert.equal(own.status, 200);
  await own.arrayBuffer();
  assert.equal(
    (await request('my-media/movie/playback', 'GET', cookies.outsider)).status,
    404,
  );
});
