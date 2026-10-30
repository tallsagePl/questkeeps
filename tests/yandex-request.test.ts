import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  yandexGet,
  withYandexDeadline,
  YandexRequestError,
} from '../lib/yandex-request';

const reset = () =>
  new TypeError('fetch failed', {
    cause: Object.assign(new Error('reset'), { code: 'ECONNRESET' }),
  });

const options = (signal = new AbortController().signal) => ({
  signal,
  headers: { Range: 'bytes=0-1' },
});

const read = async (response: Response) => response;

test('a connection reset is retried once with the same range and credentials', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (_url, init) => {
    calls++;
    assert.equal(new Headers(init?.headers).get('range'), 'bytes=0-1');
    if (calls === 1) throw reset();
    return new Response('ok');
  };
  try {
    const r = await yandexGet(
      'https://downloader.disk.yandex.ru/file',
      options(),
      'file',
      read,
      { retryDelayMs: 0 },
    );
    assert.equal(await r.text(), 'ok');
    assert.equal(calls, 2);
    calls = 0;
    globalThis.fetch = async () => {
      calls++;
      throw reset();
    };
    await assert.rejects(
      yandexGet(
        'https://downloader.disk.yandex.ru/file',
        options(),
        'file',
        read,
        { retryDelayMs: 0 },
      ),
      (e: unknown) => e instanceof YandexRequestError && e.reason === 'network',
    );
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = original;
  }
});

test('transient HTTP errors are retried; long Retry-After, authorization, ranges and certificate errors are not', async () => {
  const original = globalThis.fetch;
  try {
    let calls = 0;
    let canceled = false;
    globalThis.fetch = async () =>
      ++calls === 1
        ? new Response(
            new ReadableStream({
              cancel() {
                canceled = true;
              },
            }),
            { status: 503 },
          )
        : new Response('ok');
    assert.equal(
      (
        await yandexGet(
          'https://cloud-api.yandex.net/',
          options(),
          'metadata',
          read,
          { retryDelayMs: 0 },
        )
      ).status,
      200,
    );
    assert.equal(calls, 2);
    assert.equal(canceled, true);
    for (const status of [401, 403, 404, 416]) {
      calls = 0;
      globalThis.fetch = async () => {
        calls++;
        return new Response(null, { status });
      };
      assert.equal(
        (
          await yandexGet(
            'https://cloud-api.yandex.net/',
            options(),
            'metadata',
            read,
          )
        ).status,
        status,
      );
      assert.equal(calls, 1);
    }
    calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return new Response(null, {
        status: 429,
        headers: { 'Retry-After': '120' },
      });
    };
    await assert.rejects(
      yandexGet('https://cloud-api.yandex.net/', options(), 'metadata', read),
      YandexRequestError,
    );
    assert.equal(calls, 1);
    calls = 0;
    globalThis.fetch = async () => {
      calls++;
      throw new TypeError('certificate', {
        cause: { code: 'CERT_HAS_EXPIRED' },
      });
    };
    await assert.rejects(
      yandexGet('https://cloud-api.yandex.net/', options(), 'metadata', read),
      /certificate/,
    );
    assert.equal(calls, 1);
    await assert.rejects(
      yandexGet(
        'https://cloud-api.yandex.net/',
        { ...options(), method: 'POST' },
        'metadata',
        read,
      ),
      /read-only/,
    );
    assert.equal(
      calls,
      1,
      'token exchange and writes cannot accidentally inherit retries',
    );
  } finally {
    globalThis.fetch = original;
  }
});

test('caller cancellation during backoff never starts a second request', async () => {
  const original = globalThis.fetch;
  const controller = new AbortController();
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    setTimeout(() => controller.abort(), 5);
    throw reset();
  };
  try {
    await assert.rejects(
      yandexGet(
        'https://cloud-api.yandex.net/',
        options(controller.signal),
        'metadata',
        read,
        { retryDelayMs: 50 },
      ),
      { name: 'AbortError' },
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = original;
  }
});

test('one deadline bounds all retries and clears on success', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (_url, init) => {
    calls++;
    return new Promise((_resolve, reject) =>
      init!.signal!.addEventListener(
        'abort',
        () => reject(init!.signal!.reason),
        { once: true },
      ),
    );
  };
  try {
    const start = performance.now();
    await assert.rejects(
      withYandexDeadline(
        undefined,
        (signal) =>
          yandexGet(
            'https://cloud-api.yandex.net/',
            options(signal),
            'metadata',
            read,
            { attemptMs: 15, retryDelayMs: 0 },
          ),
        25,
      ),
      (e: unknown) => e instanceof YandexRequestError && e.reason === 'timeout',
    );
    assert.ok(performance.now() - start < 200);
    assert.ok(calls <= 2);
  } finally {
    globalThis.fetch = original;
  }
});

test('an established video stream survives opening deadlines but still obeys caller cancellation', async () => {
  const original = globalThis.fetch;
  const parent = new AbortController();
  let signal: AbortSignal | undefined;
  let stream: ReadableStreamDefaultController<Uint8Array>;
  let calls = 0;
  globalThis.fetch = async (_url, init) => {
    calls++;
    signal = init!.signal!;
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          stream = controller;
          signal!.addEventListener(
            'abort',
            () => controller.error(signal!.reason),
            { once: true },
          );
        },
      }),
    );
  };
  try {
    const response = await withYandexDeadline(
      parent.signal,
      (active) =>
        yandexGet(
          'https://downloader.disk.yandex.ru/file',
          options(active),
          'file',
          read,
          { attemptMs: 10 },
        ),
      20,
    );
    await new Promise((resolve) => setTimeout(resolve, 35));
    assert.equal(
      signal!.aborted,
      false,
      'stream cannot be killed by the old 10/20s opening timer',
    );
    stream!.enqueue(new Uint8Array([1, 2]));
    const reader = response.body!.getReader();
    assert.deepEqual((await reader.read()).value, new Uint8Array([1, 2]));
    parent.abort();
    await assert.rejects(reader.read(), { name: 'AbortError' });
    assert.equal(calls, 1, 'an already handed-off stream is never replayed');
  } finally {
    globalThis.fetch = original;
  }
});

test('a truncated metadata body can recover before it is handed to the caller', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return calls === 1
      ? new Response(
          new ReadableStream({
            start(controller) {
              controller.error(reset());
            },
          }),
        )
      : Response.json({ ok: true });
  };
  try {
    const result = await yandexGet(
      'https://cloud-api.yandex.net/',
      options(),
      'metadata',
      (response) => response.json(),
      { retryDelayMs: 0 },
    );
    assert.deepEqual(result, { ok: true });
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = original;
  }
});
