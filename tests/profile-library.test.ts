import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';

process.env.DATABASE_PATH =
  './data/profile-library-' + randomUUID() + '.sqlite';

process.env.APP_URL = 'http://localhost:3000';

const { db, run, id, encrypt } = await import('../lib/db');

const { handle } = await import('../lib/api');

const { session, mediaFor } = await import('../lib/access');

const { ensureUsername } = await import('../lib/profiles');

const { ownProfileMedia } = await import('../lib/profile-media');

const [alice, bob, eve] = [id(), id(), id()];

for (const u of [alice, bob, eve]) {
  run(
    'INSERT INTO users VALUES (?,?,?,?,?)',
    u,
    u + '@fixture.invalid',
    'Person ' + u,
    null,
    Date.now(),
  );
  ensureUsername(u);
}

const cookies = new Map(
  [alice, bob, eve].map((u) => [u, 'ta_session=' + session(u)]),
);

function request(u: string | null, path: string) {
  return handle(
    new NextRequest('http://localhost:3000/api/' + path, {
      headers: { cookie: u ? cookies.get(u)! : '' },
    }),
    path.split('?')[0].split('/'),
  );
}

function trip(owner: string, title: string) {
  const tid = id();
  run(
    'INSERT INTO trips(id,owner_id,title,destination,start,end,created) VALUES (?,?,?,?,?,?,?)',
    tid,
    owner,
    title,
    'Private destination',
    '2026-10-10',
    '2026-10-20',
    Date.now(),
  );
  return tid;
}

const shared = trip(bob, 'Shared');

trip(bob, 'Never expose');

const departed = trip(bob, 'Departed');

const nonoverlap = trip(eve, 'No common dates');

for (const [tid, u, start, end, active] of [
  [shared, alice, '2026-10-12', '2026-10-14', 1],
  [departed, alice, '2026-10-12', '2026-10-14', 0],
  [nonoverlap, alice, '2026-10-10', '2026-10-11', 1],
  [nonoverlap, bob, '2026-10-13', '2026-10-14', 1],
] as const)
  run('INSERT INTO members VALUES (?,?,?,?,?)', tid, u, start, end, active);

const aid = id();

const sid = id();

run(
  'INSERT INTO accounts(id,user_id,yandex_id,label,token,disk_enabled) VALUES (?,?,?,?,?,1)',
  aid,
  alice,
  'fixture',
  'Fixture',
  encrypt('dummy'),
);

run(
  'INSERT INTO sources(id,trip_id,user_id,account_id,path,approved) VALUES (?,?,?,?,?,0)',
  sid,
  departed,
  alice,
  aid,
  'disk:/fixture',
);

for (let i = 0; i < 65; i++) {
  const mid = 'media-' + i.toString().padStart(3, '0');
  run(
    'INSERT INTO media(id,source_id,trip_id,user_id,resource_id,path,name,mime,kind,taken,date_basis,hidden) VALUES (?,?,?,?,?,?,?,?,?,?,?,1)',
    mid,
    sid,
    departed,
    alice,
    mid,
    'disk:/fixture/' + mid,
    mid + '.jpg',
    'image/jpeg',
    'photo',
    '2026-10-13T12:00:00',
    'exif',
  );
}

after(() => db.close());

test('shared profile trips require authentication, both active memberships and overlapping dates', async () => {
  const path = 'profiles/' + ensureUsername(bob) + '/shared-trips';
  assert.equal((await request(null, path)).status, 401);
  const r = await request(alice, path);
  assert.equal(r.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual((await r.json()).trips, [
    { id: shared, title: 'Shared', start: '2026-10-12', end: '2026-10-14' },
  ]);
  assert.deepEqual((await (await request(eve, path)).json()).trips, [
    {
      id: nonoverlap,
      title: 'No common dates',
      start: '2026-10-13',
      end: '2026-10-14',
    },
  ]);
  assert.deepEqual((await (await request(bob, path)).json()).trips, []);
  run(
    'UPDATE members SET active=0 WHERE trip_id=? AND user_id=?',
    shared,
    alice,
  );
  assert.deepEqual((await (await request(alice, path)).json()).trips, []);
});

test('author file library is paginated, isolated and stable for duplicate dates', async () => {
  assert.equal((await request(null, 'my-media/groups')).status, 401);
  const groups = await (await request(alice, 'my-media/groups')).json();
  assert.deepEqual(groups.groups, [
    { id: departed, title: 'Departed', count: 65 },
  ]);
  assert.deepEqual(
    (await (await request(bob, 'my-media/groups')).json()).groups,
    [],
  );
  let cursor: string | null = null;
  const ids: string[] = [];
  do {
    const r = await (
      await request(
        alice,
        'my-media?trip=' + departed + (cursor ? '&cursor=' + cursor : ''),
      )
    ).json();
    assert.ok(r.media.length <= 30);
    ids.push(...r.media.map((m: any) => m.id));
    cursor = r.next;
  } while (cursor);
  assert.equal(ids.length, 65);
  assert.equal(new Set(ids).size, 65);
  assert.deepEqual(
    (await (await request(bob, 'my-media?trip=' + departed)).json()).media,
    [],
  );
  assert.equal(
    (await request(alice, 'my-media?trip=' + departed + '&cursor=oops')).status,
    400,
  );
});

test('private author preview may read own hidden departed files, never another author or a guest', async () => {
  const own = new Request(
    'http://localhost:3000/api/my-media/media-001/preview',
    { headers: { cookie: cookies.get(alice)! } },
  );
  assert.equal(ownProfileMedia(own, 'media-001').user_id, alice);
  assert.throws(() => mediaFor(own, 'media-001'));
  assert.equal((await request(bob, 'my-media/media-001/preview')).status, 404);
  assert.equal(
    (await request(null, 'my-media/media-001/preview?share=anything')).status,
    401,
  );
  run('UPDATE media SET missing=1 WHERE id=?', 'media-001');
  assert.throws(() => ownProfileMedia(own, 'media-001'));
});

test('profile library uses saved gallery titles and reflects later edits', async () => {
  const read = async () =>
    (
      await (await request(alice, 'my-media?trip=' + departed)).json()
    ).media.find((m: any) => m.id === 'media-064');
  assert.equal((await read()).title, null);
  run(
    'INSERT INTO media_titles(media_id,title) VALUES (?,?)',
    'media-064',
    'Evening by the sea',
  );
  assert.equal((await read()).title, 'Evening by the sea');
  run(
    'UPDATE media_titles SET title=? WHERE media_id=?',
    'A new gallery title',
    'media-064',
  );
  assert.equal((await read()).title, 'A new gallery title');
  run('DELETE FROM media_titles WHERE media_id=?', 'media-064');
  const original = await read();
  assert.equal(original.title, null);
  assert.equal(original.name, 'media-064.jpg');
});
