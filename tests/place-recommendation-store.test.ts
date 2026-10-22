import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSavedSearches } from '../lib/place-recommendation-store';

test('saved discoveries survive reload and exclude changed or inaccessible photos', () => {
  const raw = JSON.stringify([
    ['photo:rev1', [{ pageid: 1, title: 'Музей', dist: 10 }]],
    ['empty:rev1', []],
    ['deleted:rev1', [{ pageid: 2, title: 'Храм', dist: 20 }]],
    ['changed:rev1', [{ pageid: 3, title: 'Дворец', dist: 30 }]],
    ['invalid', [{ pageid: -1, title: 'Invalid', dist: 0 }]],
  ]);
  const saved = readSavedSearches(
    raw,
    new Set(['photo:rev1', 'empty:rev1', 'changed:rev2', 'invalid']),
  );
  assert.equal(saved.size, 2);
  assert.equal(saved.get('photo:rev1')?.[0].title, 'Музей');
  assert.deepEqual(saved.get('empty:rev1'), []);
  assert.equal(readSavedSearches('{broken', new Set()).size, 0);
});
