import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { moveMentions } from '../lib/mentions';
process.env.DATABASE_PATH = './data/mentions-' + randomUUID() + '.sqlite';
process.env.APP_URL = 'http://localhost:3000';
const { db, run, one } = await import('../lib/db');
const { handle } = await import('../lib/api');
const { session, userProfile, tripData } = await import('../lib/access');
for (const [id, name] of [
  ['owner', 'Сова'],
  ['friend', 'Андрей'],
  ['stranger', 'Саша'],
]) {
  run(
    'INSERT INTO users VALUES (?,?,?,?,?)',
    id,
    id + '@test.local',
    name,
    'secret',
    Date.now(),
  );
  userProfile(id);
}
run(
  'INSERT INTO trips(id,owner_id,title,destination,start,end,created,share_hash) VALUES (?,?,?,?,?,?,?,?)',
  'trip',
  'owner',
  'Trip',
  '',
  '2026-10-10',
  '2026-10-18',
  Date.now(),
  null,
);
const cookies = Object.fromEntries(
  ['owner', 'friend', 'stranger'].map((id) => [
    id,
    'ta_session=' + session(id),
  ]),
);
async function req(
  path: string,
  method = 'GET',
  data?: unknown,
  who = 'owner',
) {
  return handle(
    new NextRequest('http://localhost:3000/api/' + path, {
      method,
      headers: { origin: 'http://localhost:3000', cookie: cookies[who] || '' },
      body: data === undefined ? undefined : JSON.stringify(data),
    }),
    path.split('?')[0].split('/'),
  );
}
after(() => db.close());
test('display name and unique case-insensitive username are independent; profiles expose no private fields', async () => {
  let res = await req('me', 'PATCH', { username: 'Tallsage' });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).user.username, 'tallsage');
  await req('me', 'PATCH', { name: 'Сова' });
  assert.equal(userProfile('owner')!.username, 'tallsage');
  await req('me', 'PATCH', { username: 'andrey' }, 'friend');
  assert.equal(
    (await req('me', 'PATCH', { username: 'TALLSAGE' }, 'friend')).status,
    409,
  );
  for (const username of [
    'ab',
    'test-name',
    'admin/x',
    'кириллица',
    'bad name',
    'a'.repeat(31),
  ])
    assert.equal((await req('me', 'PATCH', { username })).status, 400);
  const pub = await req('profiles/TALLSAGE', 'GET', undefined, 'guest');
  assert.equal(pub.status, 200);
  const data = (await pub.json()).profile;
  assert.deepEqual(Object.keys(data).sort(), [
    'hasAvatar',
    'id',
    'name',
    'username',
  ]);
  assert.equal(data.name, 'Сова');
  assert.equal(
    (await req('profiles/no_such_person', 'GET', undefined, 'guest')).status,
    404,
  );
  assert.equal(
    (await req('profiles?q=and', 'GET', undefined, 'guest')).status,
    401,
  );
  const search = await req('profiles?q=' + encodeURIComponent('андрей'));
  assert.equal((await search.json()).users[0].username, 'andrey');
});
test('selected names and typed mentions link accounts, preserve authored text and enforce owner rights', async () => {
  const description = '  Поездка с Сашей и @andrey.\nОтдых  ',
    start = description.indexOf('Сашей');
  const res = await req('trips/trip', 'PATCH', {
    description,
    mentions: [{ start, end: start + 5, userId: 'owner' }],
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.description, description.trim());
  assert.equal(data.descriptionMentions.length, 2);
  assert.equal(data.descriptionMentions[0].start, start - 2);
  assert.equal(data.descriptionMentions[0].username, 'tallsage');
  assert.equal(data.descriptionMentions[1].username, 'andrey');
  const snapshot = one(
    'SELECT description FROM trips WHERE id=?',
    'trip',
  )!.description;
  assert.equal(
    (
      await req(
        'trips/trip',
        'PATCH',
        { description: 'forbidden', mentions: [] },
        'friend',
      )
    ).status,
    403,
  );
  assert.equal(
    one('SELECT description FROM trips WHERE id=?', 'trip')!.description,
    snapshot,
  );
  for (const mentions of [
    [{ start: 0, end: 999, userId: 'owner' }],
    [{ start: 0, end: 5, userId: 'missing' }],
    [
      { start: 0, end: 8, userId: 'owner' },
      { start: 1, end: 6, userId: 'friend' },
    ],
  ])
    assert.equal(
      (await req('trips/trip', 'PATCH', { description: snapshot, mentions }))
        .status,
      400,
    );
  await req('me', 'PATCH', { username: 'andrey_new' }, 'friend');
  const renamed = await req('trips/trip', 'PATCH', { description: snapshot });
  assert.equal(
    (await renamed.json()).descriptionMentions[1].username,
    'andrey_new',
  );
  await req('me', 'PATCH', { name: 'Новое имя' });
  const view = tripData(
    new Request('http://localhost:3000', {
      headers: { cookie: cookies.owner },
    }),
    'trip',
  );
  assert.equal(view.trip.descriptionMentions[0].name, 'Новое имя');
  await req('trips/trip', 'PATCH', { description: 'Другое описание' });
  assert.equal(
    one(
      'SELECT count(*) n FROM trip_description_mentions WHERE trip_id=?',
      'trip',
    )!.n,
    0,
  );
});
test('editing text shifts intact mentions and removes only edited names', () => {
  const links = [{ start: 8, end: 12, userId: 'a' }];
  assert.deepEqual(moveMentions('Поездка Саша', 'Наша поездка Саша', links), [
    { start: 13, end: 17, userId: 'a' },
  ]);
  assert.deepEqual(moveMentions('Поездка Саша', 'Поездка Маша', links), []);
  assert.deepEqual(moveMentions('Поездка Саша', 'Поездка Саша!', links), links);
});
