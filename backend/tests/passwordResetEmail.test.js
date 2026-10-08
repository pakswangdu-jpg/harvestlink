import assert from 'node:assert/strict';
import { test } from 'node:test';

test('reset email requires an actual successful email provider response', async (t) => {
  const originalKey = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = 'test-key-not-used-for-network';
  t.after(() => {
    if (originalKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalKey;
  });
  let response = { data: { id: 'email-1' }, error: null };
  let sent;
  t.mock.module('resend', {
    namedExports: { Resend: class {
      emails = { send: async (payload) => { sent = payload; return response; } };
    } },
  });
  const { sendPasswordResetEmail } = await import('../src/lib/email.js');
  const link = 'https://auth.example.com/verify?token=secret&type=recovery';
  await sendPasswordResetEmail('buyer@example.com', link);
  assert.deepEqual(sent.to, ['buyer@example.com']);
  assert.equal(sent.subject, 'Reset your HarvestLink password');
  assert.ok(sent.text.includes(link));
  assert.ok(sent.html.includes('token=secret&amp;type=recovery'));

  response = { data: null, error: { message: 'Provider rejected recipient' } };
  await assert.rejects(sendPasswordResetEmail('buyer@example.com', link), /Unable to send/);
  response = { data: {}, error: null };
  await assert.rejects(sendPasswordResetEmail('buyer@example.com', link), /Unable to send/);

  delete process.env.RESEND_API_KEY;
  const unconfigured = await import('../src/lib/email.js?unconfigured');
  await assert.rejects(unconfigured.sendPasswordResetEmail('buyer@example.com', link), /not configured/);
});
