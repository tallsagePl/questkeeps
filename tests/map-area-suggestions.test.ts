import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { photoInArea } from '../lib/area-membership';

process.env.DATABASE_PATH = './data/map-areas-' + randomUUID() + '.sqlite';

process.env.APP_URL = 'http://localhost:3000';

const { db, run, all, one } = await import('../lib/db');

const { handle } = await import('../lib/api');

const { session } = await import('../lib/access');

const { photoSearchRegions } = await import('../lib/photo-search-regions');

const area = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { title: 'Новый район', kind: 'district' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [28.97, 41],
            [28.99, 41],
            [28.99, 41.02],
            [28.97, 41.02],
            [28.97, 41],
          ],
          [
            [28.979, 41.009],
            [28.981, 41.009],
            [28.981, 41.011],
            [28.979, 41.011],
            [28.979, 41.009],
          ],
        ],
      },
    },
  ],
};

for (const u of ['owner', 'member', 'stranger'])
  run(
    'INSERT INTO users VALUES (?,?,?,?,?)',
    u,
    u + '@test.local',
    u,
    null,
    Date.now(),
  );

for (const tid of ['trip', 'foreign'])
  run(
    'INSERT INTO trips(id,owner_id,title,destination,start,end,created) VALUES (?,?,?,?,?,?,?)',
    tid,
    'owner',
    'Trip',
    '',
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

for (const u of ['owner', 'member']) {
  run(
    'INSERT INTO accounts(id,user_id,yandex_id,label,token) VALUES (?,?,?,?,?)',
    'acc-' + u,
    u,
    u,
    u,
    '',
  );
  run(
    'INSERT INTO sources(id,trip_id,user_id,account_id,path,approved) VALUES (?,?,?,?,?,1)',
    's-' + u,
    'trip',
    u,
    'acc-' + u,
    'disk:/',
  );
}

run(
  'INSERT INTO sources(id,trip_id,user_id,account_id,path,approved) VALUES (?,?,?,?,?,0)',
  'unapproved-source',
  'trip',
  'owner',
  'acc-owner',
  'disk:/private',
);

for (const [id, user, day, lat, lon, hidden, missing, kind, source] of [
  ['one', 'owner', '2026-10-11', 41.005, 28.975, 0, 0, 'photo', 's-owner'],
  ['two', 'owner', '2026-10-14', 41.015, 28.975, 0, 0, 'photo', 's-owner'],
  [
    'member-photo',
    'member',
    '2026-10-13',
    41.005,
    28.985,
    0,
    0,
    'photo',
    's-member',
  ],
  [
    'member-early',
    'member',
    '2026-10-11',
    41.005,
    28.985,
    0,
    0,
    'photo',
    's-member',
  ],
  ['hole', 'owner', '2026-10-11', 41.01, 28.98, 0, 0, 'photo', 's-owner'],
  ['outside', 'owner', '2026-10-11', 41.1, 28.98, 0, 0, 'photo', 's-owner'],
  ['hidden', 'owner', '2026-10-11', 41.005, 28.975, 1, 0, 'photo', 's-owner'],
  ['missing', 'owner', '2026-10-11', 41.005, 28.975, 0, 1, 'photo', 's-owner'],
  ['video', 'owner', '2026-10-11', 41.005, 28.975, 0, 0, 'video', 's-owner'],
  [
    'unapproved',
    'owner',
    '2026-10-11',
    41.005,
    28.975,
    0,
    0,
    'photo',
    'unapproved-source',
  ],
])
  run(
    'INSERT INTO media(id,source_id,trip_id,user_id,resource_id,path,name,mime,kind,taken,date_basis,lat,lon,hidden,missing) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    id,
    source,
    'trip',
    user,
    id,
    '/' + id,
    id,
    'image/jpeg',
    kind,
    day,
    'exif',
    lat,
    lon,
    hidden,
    missing,
  );

run(
  'INSERT INTO map_areas VALUES (?,?,?,?,?,?,?,?,?)',
  'osm-relation-100',
  'Новый район',
  'district',
  'Новый район — район.',
  'https://www.openstreetmap.org/relation/100',
  41.01,
  28.98,
  JSON.stringify(area),
  Date.now(),
);

for (const region of photoSearchRegions(
  all('SELECT lat,lon FROM media') as { lat: number; lon: number }[],
))
  run(
    'INSERT OR REPLACE INTO map_area_city_cache VALUES (?,?,?)',
    region.key,
    JSON.stringify(['osm-relation-100']),
    Date.now(),
  );

const cookies = Object.fromEntries(
  ['owner', 'member', 'stranger'].map((u) => [u, 'ta_session=' + session(u)]),
);

const req = (path: string, method = 'GET', data?: unknown, user = 'owner') =>
  handle(
    new NextRequest('http://localhost:3000/api/' + path, {
      method,
      headers: { origin: 'http://localhost:3000', cookie: cookies[user] || '' },
      body: data === undefined ? undefined : JSON.stringify(data),
    }),
    path.split('/'),
  );

after(() => db.close());

test('polygon matching respects holes and street matching uses 30 metres', () => {
  assert.equal(photoInArea({ lat: 41.005, lon: 28.975 }, area), true);
  assert.equal(photoInArea({ lat: 41.01, lon: 28.98 }, area), false);
  assert.equal(photoInArea({ lat: 41.1, lon: 28.98 }, area), false);
  const street = {
    features: [
      {
        geometry: {
          type: 'LineString',
          coordinates: [
            [0, 0],
            [0.01, 0],
          ],
        },
      },
    ],
  };
  assert.equal(photoInArea({ lat: 25 / 111320, lon: 0.005 }, street), true);
  assert.equal(photoInArea({ lat: 35 / 111320, lon: 0.005 }, street), false);
});

test('area discovery and atomic batch attachment enforce author, dates, visibility and idempotence', async () => {
  const path = 'trips/trip/area-suggestions';
  const discovery = await req(path);
  assert.equal(discovery.status, 200);
  const data = await discovery.json();
  assert.deepEqual(data.candidates[0].photoIds.sort(), [
    'member-early',
    'member-photo',
    'one',
    'two',
  ]);
  assert.equal(
    (await req(path, 'POST', { areaId: 'osm-relation-100' }, 'guest')).status,
    401,
  );
  assert.equal(
    (await req(path, 'POST', { areaId: 'osm-relation-100' }, 'stranger'))
      .status,
    403,
  );
  assert.equal(
    (
      await req('trips/foreign/area-suggestions', 'POST', {
        areaId: 'osm-relation-100',
      })
    ).status,
    404,
  );
  const member = await req(
    path,
    'POST',
    { areaId: 'osm-relation-100' },
    'member',
  );
  assert.equal(member.status, 200);
  assert.equal((await member.json()).added, 1);
  assert.deepEqual(
    all('SELECT media_id FROM confirmed_places').map((p) => p.media_id),
    ['member-photo'],
  );
  const owner = await req(path, 'POST', { areaId: 'osm-relation-100' });
  assert.equal((await owner.json()).added, 3);
  assert.equal(
    (await (await req(path, 'POST', { areaId: 'osm-relation-100' })).json())
      .added,
    0,
  );
  assert.deepEqual(
    all('SELECT media_id FROM confirmed_places ORDER BY media_id').map(
      (p) => p.media_id,
    ),
    ['member-early', 'member-photo', 'one', 'two'],
  );
  const place = one('SELECT id FROM confirmed_places WHERE media_id=?', 'one')!;
  const geometry = await req('media/one/places/' + place.id + '/geometry');
  assert.equal(geometry.status, 200);
  assert.deepEqual(await geometry.json(), area);
  assert.equal(
    (await req('media/one/places/' + place.id + '/image')).status,
    200,
  );
  assert.equal(
    (await req('trips/trip/places/osm-relation-100', 'DELETE')).status,
    200,
  );
  assert.equal(all('SELECT id FROM confirmed_places').length, 0);
});

test('district proposals include Turkish level 8 neighbourhoods and exclude seas and whole cities', async () => {
  const { eligibleAreaObject } = await import('../lib/map-area-suggestions');
  assert.equal(
    eligibleAreaObject({
      type: 'relation',
      tags: {
        name: 'Cankurtaran Mahallesi',
        type: 'boundary',
        boundary: 'administrative',
        admin_level: '8',
      },
    }),
    true,
  );
  assert.equal(
    eligibleAreaObject({
      type: 'relation',
      tags: { name: 'Мраморное море', type: 'multipolygon', place: 'sea' },
    }),
    false,
  );
  assert.equal(
    eligibleAreaObject({
      type: 'relation',
      tags: {
        name: 'Москва',
        type: 'boundary',
        boundary: 'administrative',
        admin_level: '4',
        place: 'city',
      },
    }),
    false,
  );
});

test('area Wikipedia uses exact OSM and Wikidata links, free images and cached authorized responses', async () => {
  const { resolveAreaWiki } = await import('../lib/map-area-wiki');
  const original = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = async (input: any) => {
    const url = new URL(String(input));
    calls.push(url.href);
    if (url.hostname === 'www.openstreetmap.org') {
      const id = url.pathname.split('/').pop()!.replace('.json', '');
      return Response.json({
        elements: [
          {
            type: 'relation',
            id: Number(id),
            tags:
              id === '101'
                ? { wikidata: 'Q101' }
                : id === '102'
                  ? {}
                  : { wikipedia: 'tr:Exact district' },
          },
        ],
      });
    }
    if (url.hostname === 'www.wikidata.org')
      return Response.json({
        entities: {
          Q101: { sitelinks: { ruwiki: { title: 'Точный район' } } },
        },
      });
    if (url.searchParams.get('prop') === 'pageimages|images') {
      assert.equal(url.searchParams.get('pilicense'), 'free');
      return Response.json({
        query: {
          pages: {
            7: {
              pageid: 7,
              thumbnail: { source: 'https://upload.wikimedia.org/example.png' },
            },
          },
        },
      });
    }
    return Response.json({
      query: {
        pages: {
          7: {
            pageid: 7,
            title: url.searchParams.get('titles'),
            extract: 'Описание',
          },
        },
      },
    });
  };
  try {
    const tr = await resolveAreaWiki('relation', '100');
    assert.equal(tr.url, null);
    assert.equal(tr.image, null);
    const ru = await resolveAreaWiki('relation', '101');
    assert.ok(ru.url?.startsWith('https://ru.wikipedia.org/wiki/'));
    assert.ok(
      calls.some(
        (url) => url.includes('ru.wikipedia.org') && url.includes('pageimages'),
      ),
    );
    const before = calls.length;
    assert.equal((await resolveAreaWiki('relation', '102')).url, null);
    assert.equal(
      calls.length,
      before + 1,
      'unlinked areas must not search unrelated articles',
    );
    run(
      'INSERT OR REPLACE INTO map_area_wiki_i18n VALUES (?,?,?,?)',
      'osm-relation-100',
      'ru',
      JSON.stringify(ru),
      Date.now(),
    );
    const path = 'trips/trip/area-suggestions/osm-relation-100/wiki';
    const response = await req(path);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), ru);
    assert.equal((await req(path, 'GET', undefined, 'stranger')).status, 403);
    assert.equal(
      (await req('trips/trip/area-suggestions/osm-relation-999/wiki')).status,
      404,
    );
  } finally {
    globalThis.fetch = original;
  }
});

test('Russian articles take priority, English is a fallback, and Turkish extracts stay hidden', async () => {
  const { resolveAreaWiki } = await import('../lib/map-area-wiki');
  const original = globalThis.fetch;
  globalThis.fetch = async (input: any) => {
    const url = new URL(String(input));
    if (url.hostname === 'www.openstreetmap.org') {
      const id = Number(url.pathname.split('/').pop()!.replace('.json', ''));
      return Response.json({
        elements: [
          {
            type: 'relation',
            id,
            tags: {
              name: 'Cankurtaran Mahallesi',
              wikipedia: 'tr:Cankurtaran',
              ...(id === 204 ? { 'name:ru': 'Русское имя' } : {}),
            },
          },
        ],
      });
    }
    if (url.hostname === 'www.wikidata.org')
      return Response.json({
        entities: {
          Q203: {
            labels: { ru: { value: 'Название из Викиданных' } },
            descriptions: { ru: { value: 'район в Турции' } },
          },
        },
      });
    if (url.searchParams.get('prop') === 'pageimages|images')
      return Response.json({ query: { pages: { 202: { pageid: 202 } } } });
    const ru = url.hostname === 'ru.wikipedia.org';
    return Response.json({
      query: {
        pages: {
          202: {
            pageid: 202,
            title: ru ? 'Джанкуртаран' : 'Cankurtaran',
            extract: ru
              ? 'Район Стамбула на европейском берегу.'
              : "Cankurtaran, İstanbul ilinin Avrupa Yakası'nda...",
            langlinks: ru ? [] : [],
            pageprops: {},
          },
        },
      },
    });
  };
  try {
    const fallback = await resolveAreaWiki('relation', '202', {
      country: 'TR',
      kind: 'district',
    });
    assert.equal(fallback.title, 'Джанкуртаран');
    assert.equal(fallback.description, 'Городской район Джанкуртаран.');
    assert.equal(fallback.url, null);
    const osmRussian = await resolveAreaWiki('relation', '204', {
      country: 'TR',
    });
    assert.equal(osmRussian.title, 'Русское имя');
    const originalLookup = globalThis.fetch;
    globalThis.fetch = async (input: any) => {
      const url = new URL(String(input));
      const response = await originalLookup(input);
      if (
        url.hostname.endsWith('wikipedia.org') &&
        url.searchParams.get('prop') !== 'pageimages|images'
      ) {
        const data = await response.json();
        if (url.hostname === 'tr.wikipedia.org')
          data.query.pages[202].langlinks = [
            { lang: 'en', '*': 'Cankurtaran, Fatih' },
          ];
        if (url.hostname === 'en.wikipedia.org') {
          data.query.pages[202].title = 'Cankurtaran, Fatih';
          data.query.pages[202].extract =
            'Cankurtaran is a neighbourhood of Fatih in Istanbul.';
        }
        return Response.json(data);
      }
      return response;
    };
    const english = await resolveAreaWiki('relation', '206', { country: 'TR' });
    assert.equal(
      english.description,
      'Cankurtaran is a neighbourhood of Fatih in Istanbul.',
    );
    assert.ok(english.url?.startsWith('https://en.wikipedia.org/'));
    assert.equal(english.title, 'Джанкуртаран');
    globalThis.fetch = originalLookup;
    const base = globalThis.fetch;
    globalThis.fetch = async (input: any) => {
      const url = new URL(String(input));
      const response = await base(input);
      if (
        url.hostname === 'tr.wikipedia.org' &&
        url.searchParams.get('prop') !== 'pageimages|images'
      ) {
        const data = await response.json();
        data.query.pages[202].langlinks = [
          { lang: 'en', '*': 'Cankurtaran, Fatih' },
          { lang: 'ru', '*': 'Джанкуртаран' },
        ];
        return Response.json(data);
      }
      return response;
    };
    const translated = await resolveAreaWiki('relation', '205', {
      country: 'TR',
    });
    assert.equal(
      translated.description,
      'Район Стамбула на европейском берегу.',
    );
    assert.ok(translated.url?.startsWith('https://ru.wikipedia.org/'));
  } finally {
    globalThis.fetch = original;
  }
});
