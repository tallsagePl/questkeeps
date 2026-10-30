import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import sharp from 'sharp';

process.env.DATABASE_PATH = './data/server-preview-' + randomUUID() + '.sqlite';

process.env.APP_URL = 'http://localhost:3000';

process.env.TOKEN_ENCRYPTION_KEY = '34'.repeat(32);

const { db, run, hash, encrypt, one } = await import('../lib/db');

const { handle } = await import('../lib/api');

const { session } = await import('../lib/access');

const { serverPreview, closePreviewCache } =
  await import('../lib/server-preview');

after(() => {
  closePreviewCache();
  db.close();
});

const png = await sharp({
  create: { width: 2, height: 2, channels: 3, background: 'red' },
})
  .png()
  .toBuffer();

for (const user of ['owner', 'author', 'member', 'outsider']) {
  run(
    'INSERT INTO users VALUES (?,?,?,?,?)',
    user,
    user + '@fixture.invalid',
    user,
    null,
    Date.now(),
  );
}

run(
  'INSERT INTO trips(id,owner_id,title,destination,start,end,share_hash,created) VALUES (?,?,?,?,?,?,?,?)',
  'trip',
  'owner',
  'Fixture',
  'Fixture',
  '2026-10-10',
  '2026-10-18',
  hash('fixture-share'),
  Date.now(),
);

for (const user of ['author', 'member'])
  run(
    'INSERT INTO members(trip_id,user_id,start,end,active) VALUES (?,?,?,?,1)',
    'trip',
    user,
    '2026-10-10',
    '2026-10-18',
  );

run(
  'INSERT INTO accounts(id,user_id,yandex_id,label,token,disk_enabled) VALUES (?,?,?,?,?,1)',
  'account',
  'author',
  'fixture',
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
  'INSERT INTO media(id,source_id,trip_id,user_id,resource_id,path,name,mime,kind,taken,date_basis,revision) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
  'photo',
  'source',
  'trip',
  'author',
  'resource',
  'disk:/fixture/a.png',
  'a.png',
  'image/png',
  'photo',
  '2026-10-13',
  'manual',
  '1',
);

const cookies = Object.fromEntries(
  ['owner', 'author', 'member', 'outsider'].map((user) => [
    user,
    'ta_session=' + session(user),
  ]),
);

const request = (path: string, cookie = '') =>
  handle(
    new NextRequest('http://localhost:3000/api/' + path, {
      headers: { cookie },
    }),
    path.split('?')[0].split('/'),
  );

test('server previews reuse bytes but never reuse access permissions', async (t) => {
  const original = globalThis.fetch;
  let metadata = 0;
  let images = 0;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(
      new Headers(init?.headers).get('authorization'),
      'OAuth dummy',
    );
    if (url.hostname === 'cloud-api.yandex.net') {
      metadata++;
      return Response.json({
        preview: 'https://downloader.disk.yandex.ru/preview/fixture',
      });
    }
    images++;
    return new Response(new Uint8Array(png), {
      headers: { 'Content-Type': 'image/png' },
    });
  };
  try {
    await t.test(
      'a second permitted viewer uses disk cache without provider calls',
      async () => {
        const cold = await request('media/photo/preview', cookies.owner);
        assert.equal(cold.status, 200);
        assert.equal(cold.headers.get('x-questkeeps-preview-cache'), 'miss');
        assert.deepEqual(Buffer.from(await cold.arrayBuffer()), png);
        assert.equal(metadata, 1);
        assert.equal(images, 1);
        const warm = await request('media/photo/preview', cookies.member);
        assert.equal(warm.status, 200);
        assert.equal(warm.headers.get('x-questkeeps-preview-cache'), 'hit');
        assert.match(warm.headers.get('cache-control')!, /private, no-store/);
        assert.equal(metadata, 1);
        assert.equal(images, 1);
      },
    );
    await t.test(
      'outsiders, revoked guest links and participation dates cannot read a warm cache',
      async () => {
        assert.equal(
          (await request('media/photo/preview', cookies.outsider)).status,
          403,
        );
        assert.equal(
          (await request('media/photo/preview?share=fixture-share')).status,
          200,
        );
        run('UPDATE trips SET share_hash=NULL WHERE id=?', 'trip');
        assert.equal(
          (await request('media/photo/preview?share=fixture-share')).status,
          404,
        );
        run(
          'UPDATE trips SET share_hash=? WHERE id=?',
          hash('fixture-share'),
          'trip',
        );
        run(
          'UPDATE members SET start=? WHERE user_id=?',
          '2026-10-14',
          'member',
        );
        assert.equal(
          (await request('media/photo/preview', cookies.member)).status,
          403,
        );
        run(
          'UPDATE members SET start=? WHERE user_id=?',
          '2026-10-10',
          'member',
        );
        assert.equal(images, 1);
      },
    );
    await t.test(
      'guest-only hiding, all hiding and disconnection apply before cache reads',
      async () => {
        run('UPDATE media SET hidden_from_guests=1 WHERE id=?', 'photo');
        assert.equal(
          (await request('media/photo/preview?share=fixture-share')).status,
          404,
        );
        assert.equal(
          (await request('media/photo/preview', cookies.member)).status,
          200,
        );
        run('UPDATE media SET hidden=1 WHERE id=?', 'photo');
        assert.equal(
          (await request('media/photo/preview', cookies.owner)).status,
          404,
        );
        assert.equal(
          (await request('my-media/photo/preview', cookies.author)).status,
          200,
        );
        run(
          'UPDATE media SET hidden=0,hidden_from_guests=0 WHERE id=?',
          'photo',
        );
        run('UPDATE accounts SET disk_enabled=0 WHERE id=?', 'account');
        assert.equal(
          (await request('media/photo/preview', cookies.owner)).status,
          409,
        );
        run('UPDATE accounts SET disk_enabled=1 WHERE id=?', 'account');
        assert.equal(images, 1);
      },
    );
    await t.test(
      'revision changes and manual reload fetch fresh preview bytes',
      async () => {
        run('UPDATE media SET revision=? WHERE id=?', '2', 'photo');
        assert.equal(
          (await request('media/photo/preview', cookies.owner)).headers.get(
            'x-questkeeps-preview-cache',
          ),
          'miss',
        );
        assert.equal(images, 2);
        assert.equal(metadata, 2);
        assert.equal(
          (
            await request('media/photo/preview?reload=123', cookies.owner)
          ).headers.get('x-questkeeps-preview-cache'),
          'miss',
        );
        assert.equal(images, 3);
        assert.equal(metadata, 3);
      },
    );
  } finally {
    globalThis.fetch = original;
  }
});

test('one canceled viewer cannot cancel another viewer sharing the same preview', async () => {
  const original = globalThis.fetch;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  let started!: () => void;
  const ready = new Promise<void>((resolve) => (started = resolve));
  let images = 0;
  let transferSignal: AbortSignal | undefined;
  globalThis.fetch = async (input, options) => {
    if (String(input).includes('cloud-api.yandex.net'))
      return Response.json({
        preview: 'https://downloader.disk.yandex.ru/preview/shared',
      });
    images++;
    transferSignal = options?.signal as AbortSignal;
    started();
    await gate;
    return new Response(new Uint8Array(png), {
      headers: { 'Content-Type': 'image/png' },
    });
  };
  const media = {
    ...one(
      'SELECT m.*,s.account_id FROM media m JOIN sources s ON s.id=m.source_id WHERE m.id=?',
      'photo',
    )!,
    revision: 'shared',
  };
  const controller = new AbortController();
  try {
    const first = serverPreview(media, controller.signal);
    const rejected = assert.rejects(first, { name: 'AbortError' });
    const second = serverPreview(media);
    await ready;
    controller.abort();
    assert.equal(transferSignal?.aborted, false);
    release();
    await rejected;
    assert.deepEqual((await second).body, png);
    assert.equal(images, 1);
  } finally {
    release();
    globalThis.fetch = original;
  }
});

test('access is rechecked after an in-flight preview finishes', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (input) => {
    if (String(input).includes('cloud-api.yandex.net'))
      return Response.json({
        preview: 'https://downloader.disk.yandex.ru/preview/revoke',
      });
    run('UPDATE media SET hidden=1 WHERE id=?', 'photo');
    return new Response(new Uint8Array(png), {
      headers: { 'Content-Type': 'image/png' },
    });
  };
  try {
    run('UPDATE media SET revision=? WHERE id=?', 'revoke', 'photo');
    assert.equal(
      (await request('media/photo/preview', cookies.member)).status,
      404,
    );
  } finally {
    run('UPDATE media SET hidden=0 WHERE id=?', 'photo');
    globalThis.fetch = original;
  }
});

test('the last canceled viewer cancels the shared provider request', async () => {
  const original = globalThis.fetch;
  let started!: () => void;
  const ready = new Promise<void>((resolve) => (started = resolve));
  let aborted = false;
  globalThis.fetch = async (input, options) => {
    if (String(input).includes('cloud-api.yandex.net'))
      return Response.json({
        preview: 'https://downloader.disk.yandex.ru/preview/abort',
      });
    return new Promise<Response>((_resolve, reject) => {
      const signal = options?.signal!;
      signal.addEventListener(
        'abort',
        () => {
          aborted = true;
          reject(signal.reason);
        },
        { once: true },
      );
      started();
    });
  };
  const media = {
    ...one(
      'SELECT m.*,s.account_id FROM media m JOIN sources s ON s.id=m.source_id WHERE m.id=?',
      'photo',
    )!,
    revision: 'all-cancel',
  };
  const first = new AbortController();
  const second = new AbortController();
  try {
    const a = assert.rejects(serverPreview(media, first.signal), {
      name: 'AbortError',
    });
    const b = assert.rejects(serverPreview(media, second.signal), {
      name: 'AbortError',
    });
    await ready;
    first.abort();
    second.abort();
    await Promise.all([a, b]);
    assert.equal(aborted, true);
  } finally {
    first.abort();
    second.abort();
    globalThis.fetch = original;
  }
});

test('different previews use at most four upstream transfers at once', async () => {
  const original = globalThis.fetch;
  let active = 0;
  let peak = 0;
  globalThis.fetch = async (input) => {
    if (String(input).includes('cloud-api.yandex.net'))
      return Response.json({
        preview: 'https://downloader.disk.yandex.ru/preview/limited',
      });
    active++;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active--;
    return new Response(new Uint8Array(png), {
      headers: { 'Content-Type': 'image/png' },
    });
  };
  const media = one(
    'SELECT m.*,s.account_id FROM media m JOIN sources s ON s.id=m.source_id WHERE m.id=?',
    'photo',
  )!;
  try {
    const result = await Promise.all(
      Array.from({ length: 9 }, (_, index) =>
        serverPreview({ ...media, revision: 'limit-' + index }),
      ),
    );
    assert.equal(result.length, 9);
    assert.ok(peak <= 4);
    assert.ok(peak >= 2);
  } finally {
    globalThis.fetch = original;
  }
});

test('a damaged provider image is never retained as a successful cache entry', async () => {
  const original = globalThis.fetch;
  let images = 0;
  globalThis.fetch = async (input) => {
    if (String(input).includes('cloud-api.yandex.net'))
      return Response.json({
        preview: 'https://downloader.disk.yandex.ru/preview/broken',
      });
    images++;
    return new Response(new Uint8Array(png.subarray(0, 33)), {
      headers: { 'Content-Type': 'image/png' },
    });
  };
  const media = {
    ...one(
      'SELECT m.*,s.account_id FROM media m JOIN sources s ON s.id=m.source_id WHERE m.id=?',
      'photo',
    )!,
    revision: 'broken',
  };
  try {
    await serverPreview(media);
    await serverPreview(media);
    assert.equal(
      images,
      2,
      'a broken image must be fetched again instead of becoming a persistent hit',
    );
  } finally {
    globalThis.fetch = original;
  }
});
