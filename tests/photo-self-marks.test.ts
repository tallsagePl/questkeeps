import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { after, test } from 'node:test';
import { NextRequest } from 'next/server';
import { migrate } from '../lib/migrations';

const { db, encrypt, hash, run } = await import('../lib/db');

const { handle } = await import('../lib/api');

const { session } = await import('../lib/access');

after(() => db.close());

test('photo self-marks are scoped to visible photos and the active trip audience', async () => {
  for (const name of ['Owner', 'Member', 'Outsider', 'Narrow', 'Former']) {
    const id = name.toLowerCase();
    run(
      'INSERT INTO users VALUES (?,?,?,?,?)',
      id,
      id + '@example.test',
      name,
      null,
      Date.now(),
    );
    run('INSERT INTO user_handles VALUES (?,?)', id, id + '_handle');
  }
  run(
    `INSERT INTO trips(id,owner_id,title,destination,start,end,share_hash,created)
     VALUES ('trip','owner','Trip','Here','2026-10-10','2026-10-15',?,0)`,
    hash('guest-link'),
  );
  run(
    `INSERT INTO members(trip_id,user_id,start,end,active) VALUES
       ('trip','member','2026-10-11','2026-10-12',1),
       ('trip','narrow','2026-10-13','2026-10-15',1),
       ('trip','former','2026-10-11','2026-10-12',0)`,
  );
  run(
    `INSERT INTO accounts(id,user_id,yandex_id,label,token,disk_enabled)
     VALUES ('account','owner','fixture','Disk',?,1)`,
    encrypt('fixture'),
  );
  run(
    `INSERT INTO sources(id,trip_id,user_id,account_id,path,approved)
     VALUES ('source','trip','owner','account','disk:/trip',1)`,
  );
  run(
    `INSERT INTO media(id,source_id,trip_id,user_id,resource_id,path,name,mime,kind,taken,date_basis)
     VALUES
       ('photo','source','trip','owner','a','disk:/trip/a.jpg','a.jpg','image/jpeg','photo','2026-10-12T23:59:59','manual'),
       ('video','source','trip','owner','b','disk:/trip/b.mp4','b.mp4','video/mp4','video','2026-10-12T23:59:59','manual')`,
  );
  const cookies = Object.fromEntries(
    ['owner', 'member', 'outsider', 'narrow', 'former'].map((id) => [
      id,
      'ta_session=' + session(id),
    ]),
  );
  const api = (path: string, user = '', method = 'GET', input?: unknown) =>
    handle(
      new NextRequest('http://localhost:3000/api/' + path, {
        method,
        headers: {
          cookie: cookies[user] || '',
          origin: 'http://localhost:3000',
        },
        body: input === undefined ? undefined : JSON.stringify(input),
      }),
      path.split('?')[0].split('/'),
    );
  const markPath = 'media/photo/self-mark';
  const setMark = (user: string, marked: boolean) =>
    api(markPath, user, 'PATCH', { marked });
  const member = { id: 'member', name: 'Member', username: 'member_handle' };
  const owner = { id: 'owner', name: 'Owner', username: 'owner_handle' };

  const empty = await api(markPath, 'member');
  assert.equal(empty.status, 200);
  assert.equal(empty.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(await empty.json(), { markedByMe: false, people: [] });
  for (const response of await Promise.all([
    setMark('member', true),
    setMark('member', true),
  ])) {
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      markedByMe: true,
      people: [member],
    });
  }
  assert.deepEqual(await (await api(markPath, 'owner')).json(), {
    markedByMe: false,
    people: [member],
  });
  assert.deepEqual(await (await setMark('owner', true)).json(), {
    markedByMe: true,
    people: [member, owner],
  });
  assert.equal(
    (
      await api(markPath, 'member', 'PATCH', {
        marked: false,
        userId: owner.id,
      })
    ).status,
    400,
  );

  for (const method of ['GET', 'PATCH']) {
    const input = method === 'PATCH' ? { marked: false } : undefined;
    assert.equal((await api(markPath, '', method, input)).status, 401);
    for (const user of ['outsider', 'narrow', 'former'])
      assert.equal((await api(markPath, user, method, input)).status, 403);
    for (const user of ['', 'member'])
      assert.equal(
        (await api(markPath + '?share=guest-link', user, method, input)).status,
        403,
      );
    assert.equal(
      (await api('media/video/self-mark', 'owner', method, input)).status,
      404,
    );
  }
  const shared = await api('share/guest-link', 'member');
  assert.equal(shared.status, 200);
  assert.doesNotMatch(await shared.text(), /member_handle|markedByMe/);
  for (const marked of [false, false, true]) {
    assert.deepEqual(await (await setMark('member', marked)).json(), {
      markedByMe: marked,
      people: marked ? [member, owner] : [owner],
    });
  }

  run("UPDATE users SET name='Traveller' WHERE id='member'");
  run("UPDATE user_handles SET username='new_handle' WHERE user_id='member'");
  const rollback = spawnSync(
    process.platform === 'win32' ? 'python' : 'python3',
    ['deploy/media-archive-schema.py', process.env.DATABASE_PATH!, '17'],
    { encoding: 'utf8', windowsHide: true },
  );
  assert.equal(
    rollback.status,
    0,
    rollback.stderr || rollback.error?.message || '',
  );
  assert.equal(db.pragma('user_version', { simple: true }), 17);
  migrate(db);
  assert.equal(db.pragma('user_version', { simple: true }), 18);
  assert.deepEqual(await (await api(markPath, 'member')).json(), {
    markedByMe: true,
    people: [owner, { ...member, name: 'Traveller', username: 'new_handle' }],
  });

  for (const column of ['hidden', 'missing']) {
    run('UPDATE media SET ' + column + "=1 WHERE id='photo'");
    assert.equal((await api(markPath, 'owner')).status, 404);
    assert.equal((await setMark('member', false)).status, 404);
    run('UPDATE media SET ' + column + "=0 WHERE id='photo'");
  }
  run("UPDATE sources SET approved=0 WHERE id='source'");
  assert.equal((await api(markPath, 'owner')).status, 404);
  assert.equal((await setMark('member', false)).status, 404);
  run("UPDATE sources SET approved=1 WHERE id='source'");

  assert.equal((await api('media/photo', 'owner', 'DELETE')).status, 200);
  assert.equal((await api(markPath, 'owner')).status, 404);
  assert.deepEqual(db.prepare('SELECT * FROM photo_self_marks').all(), []);
  assert.deepEqual(db.pragma('foreign_key_check'), []);
});
