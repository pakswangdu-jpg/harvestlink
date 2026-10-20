import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { buildReceipt } from '../shared/receipt.js';

mock.module('../src/lib/supabaseClient.js', { namedExports: { supabaseAdmin: {} } });
const { processReceiptEmails, startReceiptEmailJob } = await import('../src/lib/receiptEmails.js');
const raw = { id: 'abcd1234-0000-4000-8000-000000000001', status: 'completed', payment_status: 'paid', payment_method: 'cod', delivery_method: 'farmer_delivery', delivery_status: 'delivered' };
const receipt = buildReceipt({ ...raw, id: raw.id, status: 'completed', paymentStatus: 'paid', paymentMethod: 'cod', deliveryMethod: 'farmer_delivery', deliveryStatus: 'delivered', productName: 'Saved produce', unitPrice: 43, quantity: 2, unit: 'kg', deliveryFee: 30, totalAmount: 116, buyerName: 'Buyer', farmerName: 'Saved farmer' }, { buyerEmail: 'registered@example.test' });
function fixture({ order = raw, acknowledgementFails = false } = {}) {
  const job = { order_id: raw.id, claim_token: 'claim-1', status: 'pending', attempts: 0, payload: null };
  const writes = [];
  const db = {
    async rpc(name) {
      assert.equal(name, 'claim_final_receipt_emails');
      if (!['pending', 'failed'].includes(job.status)) return { data: [] };
      job.status = 'sending'; job.attempts += 1;
      return { data: [{ ...job }] };
    },
    from(table) {
      let patch;
      return { select() { return this; }, eq() { return this; }, single: async () => ({ data: order }),
        update(value) { assert.equal(table, 'order_receipt_emails'); patch = value; return this; },
        async maybeSingle() {
          writes.push(patch);
          if (acknowledgementFails && patch.status === 'sent') { acknowledgementFails = false; return { error: { message: 'Connection lost' } }; }
          Object.assign(job, patch);
          return { data: { order_id: raw.id } };
        },
      };
    },
  };
  return { db, job, writes };
}
const logger = { error() {} };

test('worker freezes the registered recipient and saved receipt before sending; sent jobs never resend', async () => {
  const { db, job } = fixture();
  const sends = [];
  const run = () => processReceiptEmails({ db, logger, load: async () => receipt, send: async (payload, key) => {
    assert.deepEqual(job.payload, payload);
    sends.push({ payload, key });
    return { id: 'provider-id' };
  } });
  await run(); await run();
  assert.equal(sends.length, 1);
  assert.equal(sends[0].key, `final-receipt/${raw.id}`);
  assert.deepEqual(sends[0].payload.to, ['registered@example.test']);
  assert.equal(job.status, 'sent');
  assert.ok(job.sent_at);
});

test('mail failures preserve completed orders and use the same frozen payload and key on retry', async () => {
  const { db, job } = fixture();
  let attempts = 0;
  const payloads = [];
  const run = () => processReceiptEmails({ db, logger, load: async () => receipt, send: async (payload, key) => {
    payloads.push(JSON.stringify({ payload, key }));
    if (++attempts === 1) throw new Error('Email unavailable');
    return { id: 'sent-id' };
  } });
  await run();
  assert.equal(job.status, 'failed');
  assert.ok(job.next_attempt_at);
  assert.equal(raw.status, 'completed');
  await run();
  assert.equal(job.status, 'sent');
  assert.equal(payloads[0], payloads[1]);
});

test('lost sent acknowledgement can be retried without changing the provider idempotency payload', async () => {
  const { db, job } = fixture({ acknowledgementFails: true });
  const messages = [];
  const run = () => processReceiptEmails({ db, logger, load: async () => receipt, send: async (payload, key) => { messages.push(JSON.stringify({ payload, key })); return { id: 'same-provider-email' }; } });
  await run(); assert.equal(job.status, 'failed');
  await run(); assert.equal(job.status, 'sent');
  assert.equal(messages[0], messages[1]);
});

test('worker rechecks final eligibility and never emails refunded or non-final orders', async () => {
  const { db, job } = fixture({ order: { ...raw, payment_status: 'refunded' } });
  await processReceiptEmails({ db, logger, load: async () => assert.fail('No receipt for non-final orders'), send: async () => assert.fail('No final email for refunded orders') });
  assert.equal(job.status, 'skipped');
});

test('scheduled receipt processing starts immediately, does not overlap and stops cleanly', async t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  let calls = 0;
  let finish;
  const stop = startReceiptEmailJob({ logger, run: () => { calls += 1; return new Promise(resolve => { finish = resolve; }); } });
  assert.equal(calls, 1);
  t.mock.timers.tick(30000);
  assert.equal(calls, 1);
  finish(); await new Promise(resolve => setImmediate(resolve));
  t.mock.timers.tick(15000);
  assert.equal(calls, 2);
  stop(); finish();
  t.mock.timers.tick(30000);
  assert.equal(calls, 2);
});
