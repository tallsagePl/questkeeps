import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';

process.env.DATABASE_PATH =
  './data/social-security-' + randomUUID() + '.sqlite';

process.env.APP_URL = 'http://localhost:3000';

process.env.TOKEN_ENCRYPTION_KEY = '34'.repeat(32);

const { db, run, id, encrypt } = await import('../lib/db');

const { handle } = await import('../lib/api');

const { session } = await import('../lib/access');

after(() => db.close());

test('revoked source blocks every place read and write before a provider request', async () => {
  const owner = id();
  const member = id();
  const trip = id();
  const account = id();
  const source = id();
  const media = id();
  for (const u of [owner, member])
    run(
      'INSERT INTO users VALUES (?,?,?,?,?)',
      u,
      u + '@fixture.invalid',
      'Fixture',
      null,
      Date.now(),
    );
  run(
    'INSERT INTO trips(id,owner_id,title,destination,start,end,created) VALUES (?,?,?,?,?,?,?)',
    trip,
    owner,
    'Fixture',
    'Fixture',
    '2026-10-10',
    '2026-10-18',
    Date.now(),
  );
  run(
    'INSERT INTO members VALUES (?,?,?,?,1)',
    trip,
    member,
    '2026-10-10',
    '2026-10-18',
  );
  run(
    'INSERT INTO accounts(id,user_id,yandex_id,label,token,disk_enabled) VALUES (?,?,?,?,?,1)',
    account,
    owner,
    'fixture-provider',
    'Fixture',
    encrypt('dummy-token'),
  );
  run(
    'INSERT INTO sources(id,trip_id,user_id,account_id,path,approved) VALUES (?,?,?,?,?,0)',
    source,
    trip,
    owner,
    account,
    'disk:/fixture',
  );
  run(
    'INSERT INTO media(id,source_id,trip_id,user_id,resource_id,path,name,mime,kind,taken,date_basis,lat,lon) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
    media,
    source,
    trip,
    owner,
    'fixture',
    'disk:/fixture/a.jpg',
    'a.jpg',
    'image/jpeg',
    'photo',
    '2026-10-13T12:00:00',
    'manual',
    1,
    2,
  );
  const c = 'ta_session=' + session(member);
  const own = 'ta_session=' + session(owner);
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return Response.json({ query: { geosearch: [] } });
  };
  const request = (p: string, method = 'GET', body?: unknown, cookie = c) =>
    handle(
      new NextRequest('http://localhost:3000/api/' + p, {
        method,
        headers: { cookie, origin: 'http://localhost:3000' },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      p.split('?')[0].split('/'),
    );
  try {
    assert.equal((await request('media/' + media + '/places')).status, 404);
    assert.equal(
      (await request('media/' + media + '/places/description?pageId=123'))
        .status,
      404,
    );
    assert.equal(
      (
        await request(
          'media/' + media + '/places',
          'POST',
          { pageId: 123 },
          own,
        )
      ).status,
      404,
    );
    assert.equal((await request('media/' + media + '/preview')).status, 404);
    assert.equal(calls, 0);
    run('UPDATE sources SET approved=1 WHERE id=?', source);
    assert.equal((await request('media/' + media + '/places')).status, 200);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = original;
  }
});

test('persistent cache selectors are opaque, distinct and do not contain a guest bearer', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'location');
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: new URL('https://fixture.invalid'),
  });
  try {
    const { opaqueCacheRequest } = await import('../lib/browser-storage');
    const a = await opaqueCacheRequest(
      '/api/media/dummy/preview?share=dummy-secret-a',
    );
    const b = await opaqueCacheRequest(
      '/api/media/dummy/preview?share=dummy-secret-b',
    );
    assert.match(
      new URL(a.url).pathname,
      new RegExp('^/__questkeeps_cache__/[a-f0-9]{64}$'),
    );
    assert.equal(a.url.includes('dummy-secret'), false);
    assert.notEqual(a.url, b.url);
  } finally {
    if (original) Object.defineProperty(globalThis, 'location', original);
    else Reflect.deleteProperty(globalThis, 'location');
  }
});

test('concurrent cold image requests share one job; canceled queued jobs do not fetch', async () => {
  const { placeImage } = await import('../lib/places');
  const original = globalThis.fetch;
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    await gate;
    return Response.json({
      query: {
        pages: {
          777: {
            thumbnail: { source: 'https://upload.wikimedia.org/fixture.jpg' },
          },
        },
      },
    });
  };
  try {
    const first = placeImage(777);
    const second = placeImage(777);
    await new Promise((r) => setImmediate(r));
    const abort = new AbortController();
    const canceled = placeImage(778, 'ru', abort.signal);
    abort.abort();
    release();
    assert.equal(await first, 'https://upload.wikimedia.org/fixture.jpg');
    assert.equal(await second, 'https://upload.wikimedia.org/fixture.jpg');
    await assert.rejects(canceled);
    assert.equal(calls, 1);
  } finally {
    release();
    globalThis.fetch = original;
  }
});

test('a search completed after logout cannot recreate private localStorage', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    'localStorage',
  );
  const original = globalThis.fetch;
  const values: Record<string, string> = {};
  const storage = {
    getItem: (key: string) => values[key] || null,
    setItem: (key: string, value: string) => {
      values[key] = value;
    },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: storage,
  });
  let release!: (response: Response) => void;
  globalThis.fetch = async () =>
    new Promise<Response>((resolve) => (release = resolve));
  try {
    const { searchPhotoPlaces, clearPlaceSearchRequests, photoSearchKey } =
      await import('../lib/place-search-client');
    const photo = {
      id: 'dummy-photo',
      revision: '1',
      lat: 1.234567,
      lon: 2.345678,
    };
    assert.equal(
      photoSearchKey(photo, 'user:fixture').includes('1.234567'),
      false,
    );
    const pending = searchPhotoPlaces(photo, 'user:fixture', 'dummy-trip');
    clearPlaceSearchRequests();
    release(Response.json({ suggestions: [] }));
    await pending;
    assert.deepEqual(values, {});
  } finally {
    globalThis.fetch = original;
    if (descriptor)
      Object.defineProperty(globalThis, 'localStorage', descriptor);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('legacy capability-bearing storage is removed while theme and new caches remain', async () => {
  const local = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const cached = Object.getOwnPropertyDescriptor(globalThis, 'caches');
  const storage: Record<string, any> = {
    'ta-theme': 'dark',
    'questkeeps:map-view:v1:guest:dummy-secret': '{}',
    'questkeeps:found-places:v1:user:fixture': '[]',
  };
  Object.defineProperties(storage, {
    removeItem: { value: (key: string) => delete storage[key] },
    getItem: { value: (key: string) => storage[key] || null },
  });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: storage,
  });
  const deleted: string[] = [];
  Object.defineProperty(globalThis, 'caches', {
    configurable: true,
    value: {
      keys: async () => [
        'questkeeps-previews-v1-fixture',
        'questkeeps-place-resources-v3-fixture',
        'questkeeps-previews-v2-current',
      ],
      delete: async (name: string) => {
        deleted.push(name);
        return true;
      },
    },
  });
  // Migration is a browser-only entry point.
  const win = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {},
  });
  try {
    const { migratePrivateStorage } = await import('../lib/browser-storage');
    await migratePrivateStorage();
    assert.deepEqual(Object.keys(storage), ['ta-theme']);
    assert.deepEqual(deleted, [
      'questkeeps-previews-v1-fixture',
      'questkeeps-place-resources-v3-fixture',
    ]);
  } finally {
    for (const [name, descriptor] of [
      ['localStorage', local],
      ['caches', cached],
      ['window', win],
    ] as const) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
});
