import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verificationMail } from '../lib/verification-email';

test('verification email has a working action, embedded brand, fallback text and real site links', async () => {
  const url = 'https://questkeeps.ru/verify-email#token=fixture-token';
  const result = await verificationMail('fixture@example.invalid', url);
  assert.equal(result.to, 'fixture@example.invalid');
  assert.ok(result.text.includes(url));
  assert.ok(result.text.includes('24 часа'));
  assert.ok(result.html?.includes('href="' + url + '"'));
  assert.ok(result.html?.includes('cid:questkeeps-logo'));
  assert.ok(result.html?.includes('https://questkeeps.ru/about'));
  assert.equal(result.attachments?.[0].content_id, 'questkeeps-logo');
  assert.equal(
    Buffer.from(result.attachments![0].content, 'base64')
      .subarray(1, 4)
      .toString(),
    'PNG',
  );
  assert.ok(!result.html?.includes('Связаться с нами'));
});

test('test emails cannot look like a real confirmation and unsafe contact URLs are rejected', async () => {
  const old = process.env.EMAIL_SUPPORT_URL;
  try {
    process.env.EMAIL_SUPPORT_URL = 'https://t.me/fixture_bot';
    const result = await verificationMail(
      'fixture@example.invalid',
      'https://questkeeps.ru/verify-email#token=unused',
      true,
    );
    assert.ok(result.html?.includes('подтверждать аккаунт не нужно'));
    assert.ok(result.html?.includes('https://t.me/fixture_bot'));
    assert.ok(!result.html?.includes('token=unused'));
    process.env.EMAIL_SUPPORT_URL = 'javascript:alert(1)';
    await assert.rejects(
      verificationMail(
        'fixture@example.invalid',
        'https://questkeeps.ru/verify-email',
      ),
      /HTTPS/,
    );
    delete process.env.EMAIL_SUPPORT_URL;
    await assert.rejects(
      verificationMail(
        'fixture@example.invalid',
        'http://external.invalid/verify-email',
      ),
      /HTTPS/,
    );
  } finally {
    if (old === undefined) delete process.env.EMAIL_SUPPORT_URL;
    else process.env.EMAIL_SUPPORT_URL = old;
  }
});

test('English registration emails use the same confirmation link and localized content', async () => {
  const result = await verificationMail(
    'fixture@example.invalid',
    'https://questkeeps.ru/verify-email#token=english-fixture',
    false,
    'en',
  );
  assert.equal(result.subject, 'Confirm your QuestKeeps email');
  assert.ok(result.html?.includes('<html lang="en">'));
  assert.ok(result.html?.includes('Confirm email'));
  assert.ok(result.html?.includes('Our website'));
  assert.ok(result.text.includes('24 hours'));
  assert.ok(!/[А-Яа-яЁё]/u.test(result.html || ''));
});
