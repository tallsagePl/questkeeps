import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dateSelection, includesDate } from '../lib/date-selection';

test('one day and inclusive range share the same date filter', () => {
  assert.deepEqual(dateSelection('2026-10-11'), ['2026-10-11', '2026-10-11']);
  assert.equal(
    includesDate('2026-10-12T16:00:00', '2026-10-11..2026-10-13'),
    true,
  );
  assert.equal(includesDate('2026-10-10', '2026-10-11..2026-10-13'), false);
  assert.equal(includesDate('2026-10-12', '2026-10-11'), false);
  assert.equal(includesDate('2026-10-12', ''), true);
});
