import assert from 'node:assert/strict';
import test from 'node:test';
import { api } from '../components/api';
import { ApiError } from '../components/feedback';

// These tests stub the transport only; no server, database or external network.
test('client API turns malformed JSON into an application error', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response('<html>Unavailable</html>', { status: 502 });
  try {
    await assert.rejects(api('fixture'), (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.applicationMessage, 'errors.requestFailed');
      assert.equal(error.status, 502);
      return true;
    });
  } finally {
    globalThis.fetch = original;
  }
});

test('client API keeps cancellation intact when reading a response', async () => {
  const original = globalThis.fetch;
  const cancellation = new DOMException('Cancelled', 'AbortError');
  const response = new Response();
  response.json = async () => {
    throw cancellation;
  };
  globalThis.fetch = async () => response;
  try {
    await assert.rejects(api('fixture'), (error) => error === cancellation);
  } finally {
    globalThis.fetch = original;
  }
});

test('client API uses message metadata without translating response content', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({
      title: 'Start',
      message: 'Ссылка скопирована',
      messageTranslation: { key: 'common.linkCopied' },
    });
  try {
    const result = await api('fixture');
    assert.equal(result.title, 'Start');
    assert.deepEqual(result.message, { key: 'common.linkCopied' });
  } finally {
    globalThis.fetch = original;
  }
});

test('legacy error consumers retain a translatable key while feedback keeps parameters', () => {
  const plain = new ApiError({ key: 'auth.invalidCredentials' });
  assert.equal(plain.message, 'auth.invalidCredentials');
  const message = {
    key: 'validation.minLength' as const,
    params: { count: 12 },
  };
  const parameterized = new ApiError(message);
  assert.deepEqual(parameterized.applicationMessage, message);
  assert.equal(parameterized.message, 'Минимум 12 символов');
});

test('transport failures are localized, and timeouts have a distinct retry message', async () => {
  const original = globalThis.fetch;
  try {
    const failure = new TypeError('Network unavailable');
    globalThis.fetch = async () => {
      throw failure;
    };
    await assert.rejects(
      api('fixture'),
      (error) =>
        error instanceof ApiError &&
        error.applicationMessage === 'errors.requestFailed',
    );
    const timeout = new DOMException('Too slow', 'TimeoutError');
    globalThis.fetch = async () => {
      throw timeout;
    };
    await assert.rejects(
      api('fixture', 'GET', undefined, AbortSignal.abort(timeout)),
      (error) =>
        error instanceof ApiError &&
        error.applicationMessage === 'errors.requestTimedOut',
    );
    const slowBody = new Response();
    slowBody.json = async () => {
      throw timeout;
    };
    globalThis.fetch = async () => slowBody;
    await assert.rejects(
      api('fixture', 'GET', undefined, AbortSignal.abort(timeout)),
      (error) =>
        error instanceof ApiError &&
        error.applicationMessage === 'errors.requestTimedOut',
    );
  } finally {
    globalThis.fetch = original;
  }
});

test('intentional request cancellation is preserved by the transport boundary', async () => {
  const original = globalThis.fetch;
  const cancellation = new DOMException('Cancelled', 'AbortError');
  globalThis.fetch = async () => {
    throw cancellation;
  };
  try {
    await assert.rejects(
      api('fixture', 'GET', undefined, AbortSignal.abort(cancellation)),
      (error) => error === cancellation,
    );
  } finally {
    globalThis.fetch = original;
  }
});
