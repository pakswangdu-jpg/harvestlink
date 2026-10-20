import assert from 'node:assert/strict';
import { test } from 'node:test';

test('final receipts reuse Resend and a stable provider idempotency key; failures are never reported as sent', async t => {
  process.env.RESEND_API_KEY = 'mock-receipt-key';
  let response = { data: { id: 'email-1' } };
  const calls = [];
  t.mock.module('resend', { namedExports: { Resend: class {
    emails = { send: async (payload, options) => { calls.push({ payload, options }); return response; } };
  } } });
  const { sendFinalReceiptEmail } = await import('../src/lib/email.js');
  const message = { to: ['registered@example.test'], html: '<p>Saved receipt</p>', text: 'Saved receipt', subject: 'HarvestLink receipt - Order ABCD1234' };
  assert.equal((await sendFinalReceiptEmail(message, 'final-receipt/order-1')).id, 'email-1');
  assert.deepEqual(calls[0], { payload: message, options: { idempotencyKey: 'final-receipt/order-1' } });
  response = { error: { message: 'Provider unavailable' } };
  await assert.rejects(sendFinalReceiptEmail(message, 'final-receipt/order-1'), /Unable to send/);
  response = { data: {} };
  await assert.rejects(sendFinalReceiptEmail(message, 'final-receipt/order-1'), /Unable to send/);
  delete process.env.RESEND_API_KEY;
  const unconfigured = await import('../src/lib/email.js?unconfigured-receipts');
  await assert.rejects(unconfigured.sendFinalReceiptEmail(message, 'final-receipt/order-1'), /not configured/);
});
