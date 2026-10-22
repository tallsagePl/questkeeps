import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { queuePreview, PREVIEW_TIMEOUT_MS } from '../lib/preview-queue';

test('очередь отдаёт приоритет экрану, вытесняет фон и отменяет ненужные запросы', async () => {
  const starts: string[] = [];
  const aborted: string[] = [];
  const handles: ReturnType<typeof queuePreview>[] = [];
  const task = (name: string) => (signal: AbortSignal) =>
    new Promise<Blob>((_resolve, reject) => {
      starts.push(name);
      signal.addEventListener(
        'abort',
        () => {
          aborted.push(name);
          reject(new DOMException('Aborted', 'AbortError'));
        },
        { once: true },
      );
    });
  const add = (name: string, priority: number) => {
    const handle = queuePreview(name, priority, task(name));
    void handle.promise.catch(() => {});
    handles.push(handle);
    return handle;
  };
  try {
    const backgrounds = [
      add('neighbor-a', 1),
      add('neighbor-b', 1),
      add('neighbor-c', 1),
    ];
    await setImmediate();
    assert.deepEqual(starts, ['neighbor-a', 'neighbor-b']);
    const oldScreen = Array.from({ length: 4 }, (_, i) => add('old-' + i, 0));
    await setImmediate();
    assert.equal(starts.length, 6);
    oldScreen.forEach((handle) => handle.setPriority(1));
    const focused = add('focused-screen', 0);
    await setImmediate();
    await setImmediate();
    assert.ok(starts.includes('focused-screen'));
    assert.ok(aborted.length > 0, 'current screen preempts background work');
    const duplicate = add('focused-screen', 0);
    await setImmediate();
    assert.equal(starts.filter((n) => n === 'focused-screen').length, 1);
    focused.release();
    assert.ok(
      !aborted.includes('focused-screen'),
      'another consumer still needs it',
    );
    duplicate.release();
    assert.ok(aborted.includes('focused-screen'));
    backgrounds.forEach((handle) => handle.release());
    const canceled = add('never-start', 1);
    canceled.release();
    await setImmediate();
    assert.ok(!starts.includes('never-start'));
  } finally {
    handles.forEach((handle) => handle.release());
    await Promise.allSettled(handles.map((handle) => handle.promise));
    await setImmediate();
  }
});

test('a stalled preview releases queue capacity on timeout even when its task ignores abort', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const handles = Array.from({ length: 6 }, (_, i) =>
    queuePreview('stalled-' + i, 0, () => new Promise<Blob>(() => {})),
  );
  const outcomes = Promise.allSettled(handles.map((h) => h.promise));
  const next = queuePreview('after-stalls', 0, async () => new Blob(['ok']));
  try {
    await setImmediate();
    t.mock.timers.tick(PREVIEW_TIMEOUT_MS);
    await setImmediate();
    const failures = await outcomes;
    assert.ok(
      failures.every(
        (result) =>
          result.status === 'rejected' && result.reason.name === 'TimeoutError',
      ),
    );
    assert.equal(
      await (await next.promise).text(),
      'ok',
      'queued photos continue after stalled requests',
    );
  } finally {
    handles.forEach((h) => h.release());
    next.release();
    t.mock.timers.reset();
  }
});
