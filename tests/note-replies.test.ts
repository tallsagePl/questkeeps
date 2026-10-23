import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';

process.env.DATABASE_PATH = './data/replies-' + randomUUID() + '.sqlite';

process.env.APP_URL = 'http://localhost:3000';

const { db, run, one } = await import('../lib/db');

const { handle } = await import('../lib/api');

const { session } = await import('../lib/access');

for (const user of ['owner', 'member', 'other'])
  run(
    'INSERT INTO users VALUES (?,?,?,?,?)',
    user,
    user + '@test.local',
    user,
    null,
    Date.now(),
  );

for (const trip of ['trip', 'different'])
  run(
    'INSERT INTO trips(id,owner_id,title,destination,start,end,created) VALUES (?,?,?,?,?,?,?)',
    trip,
    'owner',
    'Поездка',
    'Стамбул',
    '2026-10-10',
    '2026-10-18',
    Date.now(),
  );

run(
  'INSERT INTO members(trip_id,user_id,start,end,active) VALUES (?,?,?,?,1)',
  'trip',
  'member',
  '2026-10-12',
  '2026-10-14',
);

for (const [id, trip, day] of [
  ['note', 'trip', '2026-10-13'],
  ['early', 'trip', '2026-10-11'],
  ['second', 'trip', '2026-10-13'],
  ['foreign', 'different', '2026-10-13'],
])
  run(
    'INSERT INTO notes VALUES (?,?,?,?,?)',
    id,
    trip,
    'owner',
    day,
    'История',
  );

const cookies = Object.fromEntries(
  ['owner', 'member', 'other'].map((user) => [
    user,
    'ta_session=' + session(user),
  ]),
);

async function request(
  path: string,
  method = 'GET',
  body?: unknown,
  user = 'owner',
) {
  return handle(
    new NextRequest('http://localhost:3000/api/' + path, {
      method,
      headers: { origin: 'http://localhost:3000', cookie: cookies[user] || '' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    path.split('/'),
  );
}

after(() => db.close());

test('threaded replies enforce parent, author, trip and date permissions; deletion preserves other participants', async () => {
  const route = 'trips/trip/notes/note/replies';
  assert.equal(
    (await request(route, 'POST', { text: 'Сам себе' })).status,
    400,
  );
  assert.equal(
    (await request(route, 'POST', { text: 'Чужая поездка' }, 'other')).status,
    403,
  );
  assert.equal(
    (await request(route, 'POST', { text: 'Гость' }, 'guest')).status,
    401,
  );
  assert.equal(
    (
      await request(
        'trips/trip/notes/early/replies',
        'POST',
        { text: 'Вне дат' },
        'member',
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        'trips/trip/notes/foreign/replies',
        'POST',
        { text: 'Другая поездка' },
        'member',
      )
    ).status,
    404,
  );
  assert.equal(
    (await request(route, 'POST', { text: ' '.repeat(3) }, 'member')).status,
    400,
  );
  assert.equal(
    (await request(route, 'POST', { text: 'x'.repeat(3001) }, 'member')).status,
    400,
  );
  const first = await request(
    route,
    'POST',
    { text: ' Первый ответ ' },
    'member',
  );
  assert.equal(first.status, 201);
  const reply = (await first.json()).reply;
  assert.equal(reply.text, 'Первый ответ');
  assert.equal(reply.parent_id, null);
  assert.equal(
    (
      await request(
        route,
        'POST',
        { text: 'Сам себе', parentId: reply.id },
        'member',
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await request('trips/trip/notes/second/replies', 'POST', {
        text: 'Чужая ветка',
        parentId: reply.id,
      })
    ).status,
    404,
  );
  const second = await request(route, 'POST', {
    text: 'Ответ участнику',
    parentId: reply.id,
  });
  assert.equal(second.status, 201);
  const child = (await second.json()).reply;
  assert.equal((await request(route + '/' + reply.id, 'DELETE')).status, 403);
  assert.equal(
    (await request(route + '/' + reply.id, 'DELETE', undefined, 'member'))
      .status,
    200,
  );
  assert.equal(
    (
      await request(route, 'POST', {
        text: 'Удалённый родитель',
        parentId: reply.id,
      })
    ).status,
    400,
  );
  assert.equal(
    one('SELECT * FROM note_replies WHERE id=?', reply.id)!.text,
    '',
  );
  assert.equal(
    one('SELECT * FROM note_replies WHERE id=?', child.id)!.text,
    'Ответ участнику',
  );
  assert.equal(
    (await request('trips/trip/notes/note', 'DELETE', undefined, 'member'))
      .status,
    403,
  );
  assert.equal((await request('trips/trip/notes/note', 'DELETE')).status, 200);
  const view = await (
    await request('trips/trip', 'GET', undefined, 'member')
  ).json();
  assert.equal(view.notes.find((n: any) => n.id === 'note').deleted, 1);
  assert.equal(view.noteReplies.length, 2);
  assert.equal(view.noteReplies[0].deleted, 1);
  assert.equal(view.noteReplies[1].parent_id, reply.id);
  const owner = await (await request('trips/trip')).json();
  assert.equal(owner.notes.find((n: any) => n.id === 'early').text, 'История');
  assert.equal(
    (await request('trips/trip/notes/second', 'DELETE')).status,
    200,
  );
  assert.equal(one('SELECT * FROM notes WHERE id=?', 'second'), undefined);
});
