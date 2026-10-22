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
      assert.equal(error.message, 'errors.requestFailed');
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
    assert.equal(result.message, 'common.linkCopied');
  } finally {
    globalThis.fetch = original;
  }
});
