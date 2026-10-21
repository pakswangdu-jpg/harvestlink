import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verifyRecaptchaToken } from '../src/lib/recaptcha.js';

test('reCAPTCHA verification posts the token and server secret to Google', async () => {
  let request;
  const result = await verifyRecaptchaToken('temporary-token', {
    secretKey: 'server-secret',
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, async json() { return { success: true }; } };
    },
  });
  assert.equal(result, true);
  assert.equal(request.url, 'https://www.google.com/recaptcha/api/siteverify');
  assert.equal(request.options.method, 'POST');
  assert.deepEqual([...new URLSearchParams(request.options.body)], [
    ['secret', 'server-secret'],
    ['response', 'temporary-token'],
  ]);
});

test('missing CAPTCHA token fails before contacting Google', async () => {
  let contacted = false;
  await assert.rejects(
    verifyRecaptchaToken('', {
      secretKey: 'server-secret',
      fetchImpl: async () => { contacted = true; },
    }),
    (error) => error.code === 'CAPTCHA_REQUIRED' && error.status === 400,
  );
  assert.equal(contacted, false);
});

test('failed Google verification returns a safe CAPTCHA error', async () => {
  await assert.rejects(
    verifyRecaptchaToken('bad-token', {
      secretKey: 'server-secret',
      fetchImpl: async () => ({ ok: true, async json() { return { success: false, 'error-codes': ['invalid-input-secret'] }; } }),
    }),
    (error) => error.code === 'CAPTCHA_FAILED'
      && error.status === 400
      && error.message === 'Security verification failed. Please try again.',
  );
});

test('missing backend secret and Google outages fail closed without leaking provider details', async () => {
  await assert.rejects(
    verifyRecaptchaToken('temporary-token', { secretKey: '' }),
    (error) => error.code === 'CAPTCHA_UNAVAILABLE' && error.status === 503,
  );
  await assert.rejects(
    verifyRecaptchaToken('temporary-token', {
      secretKey: 'server-secret',
      fetchImpl: async () => { throw new Error('private provider detail'); },
    }),
    (error) => error.code === 'CAPTCHA_UNAVAILABLE'
      && !error.message.includes('private provider detail'),
  );
});
