import { test } from 'node:test';
import assert from 'node:assert/strict';
import { queuePlaceDescription } from '../lib/place-description-queue';
test('description queue limits concurrency, prioritizes visible cards and drops cancelled neighbors', async () => {
  let active = 0,
    peak = 0;
  const order: number[] = [],
    release: (() => void)[] = [];
  const run = (id: number) => async () => {
    active++;
    peak = Math.max(peak, active);
    order.push(id);
    await new Promise<void>((resolve) => release.push(resolve));
    active--;
    return id;
  };
  const signal = new AbortController().signal,
    cancelled = new AbortController();
  const first = queuePlaceDescription(run(1), signal),
    second = queuePlaceDescription(run(2), signal);
  const neighbor = queuePlaceDescription(run(3), signal, 1);
  const discarded = queuePlaceDescription(run(4), cancelled.signal, 1);
  const rejected = assert.rejects(discarded, { name: 'AbortError' });
  const visible = queuePlaceDescription(run(5), signal, 0);
  cancelled.abort();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(order, [1, 2]);
  release.shift()!();
  await first;
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(order, [1, 2, 5]);
  release.shift()!();
  await second;
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(order, [1, 2, 5, 3]);
  release.splice(0).forEach((resolve) => resolve());
  await Promise.all([neighbor, visible, rejected]);
  assert.equal(peak, 2);
});
