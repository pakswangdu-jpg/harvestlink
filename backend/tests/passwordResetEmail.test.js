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
  assert.ok(sent.html.includes('cid:harvestlink-logo'));
  assert.equal(sent.attachments[0].contentId, 'harvestlink-logo');
  assert.ok(sent.html.includes('Use the button below to choose a new password'));
  assert.ok(sent.text.includes('expires 10 minutes'));
  assert.ok(sent.html.includes('expires after 10 minutes'));

  const { sendContactMessageEmail } = await import('../src/lib/email.js');
  await sendContactMessageEmail({
    name: 'Juan Dela Cruz',
    email: 'juan@example.com',
    message: 'I need help with my account.',
  });
  assert.deepEqual(sent.to, ['admin.harvestlink@gmail.com']);
  assert.equal(sent.replyTo, 'juan@example.com');
  assert.equal(sent.subject, 'HarvestLink contact message from Juan Dela Cruz');
  assert.match(sent.text, /juan@example\.com/);
  assert.equal(sent.from, 'HarvestLink <noreply@harvestlink.dev>');

  response = { data: null, error: { message: 'Gmail rejected recipient' } };
  await assert.rejects(sendContactMessageEmail({
    name: 'Juan Dela Cruz',
    email: 'juan@example.com',
    message: 'I need help.',
  }), /Gmail rejected recipient/);

  response = { data: {}, error: null };
  await assert.rejects(sendContactMessageEmail({
    name: 'Juan Dela Cruz',
    email: 'juan@example.com',
    message: 'I need help.',
  }), /did not accept/);

  response = { data: null, error: { message: 'Provider rejected recipient' } };
  await assert.rejects(sendPasswordResetEmail('buyer@example.com', link), /Unable to send/);
  response = { data: {}, error: null };
  await assert.rejects(sendPasswordResetEmail('buyer@example.com', link), /Unable to send/);

  delete process.env.RESEND_API_KEY;
  const unconfigured = await import('../src/lib/email.js?unconfigured');
  await assert.rejects(unconfigured.sendPasswordResetEmail('buyer@example.com', link), /not configured/);
});
