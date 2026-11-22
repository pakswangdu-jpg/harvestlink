import assert from 'node:assert/strict';
import { beforeEach, mock, test } from 'node:test';

let order;
const writes = [];
mock.module('../src/lib/supabaseClient.js', { namedExports: { supabaseAdmin: {
  from(table) {
    let patch;
    return { select() { return this; }, eq() { return this; }, update(value) { patch = value; writes.push({ table, patch }); return this; },
      insert: async value => { writes.push({ table, value }); return { error: null }; },
      single: async () => ({ data: table === 'profiles'
        ? { gcash_account_name: 'Farmer', gcash_qr_url: '/qr' }
        : patch ? { ...order, ...patch } : order }),
    };
  },
} } });
mock.module('../src/lib/notify.js', { namedExports: { createNotification: async () => {} } });
const { approvePaymentVerification, getGcashCheckout, rejectPaymentVerification, submitPaymentProof } = await import('../src/controllers/payments.controller.js');
beforeEach(() => {
  writes.length = 0;
  order = { id: 'order', farmer_id: 'farmer', buyer_id: 'buyer', payment_method: 'gcash', payment_status: 'pending', payment_verification_status: 'pending' };
});
const invoke = (handler, profile, body = {}) => handler({ params: { orderId: 'order' }, profile, body }, { json() {} });
test('Lalamove GCash checkout and proof submission require acceptance of the final total', async () => {
  order.status = 'pending';
  const recipient = { id: 'buyer', role: 'stakeholder' };
  for (const status of ['pending', 'proposed', 'declined']) {
    order.lalamove_quote_status = status;
    await assert.rejects(invoke(getGcashCheckout, recipient), { status: 409 });
    await assert.rejects(invoke(submitPaymentProof, recipient), { status: 409 });
    await assert.rejects(invoke(approvePaymentVerification, { id: 'farmer', role: 'farmer' }), { status: 409 });
  }
  assert.equal(writes.length, 0);
  order.lalamove_quote_status = 'accepted';
  order.lalamove_accepted_total = 150;
  order.total_amount = 150;
  let checkout;
  await getGcashCheckout({ params: { orderId: 'order' }, profile: recipient }, { json(result) { checkout = result; } });
  assert.equal(checkout.order.totalAmount, 150);
  assert.equal(checkout.order.lalamoveAcceptedTotal, 150);
  await assert.rejects(invoke(submitPaymentProof, recipient), { status: 400, message: 'Your payment is already awaiting verification.' });
});
test('Admin, Buyer and unrelated Farmer remain unable to approve or reject', async () => {
  for (const profile of [{ id: 'admin', role: 'admin' }, { id: 'buyer', role: 'buyer' }, { id: 'other-farmer', role: 'farmer' }]) {
    for (const handler of [approvePaymentVerification, rejectPaymentVerification]) {
      await assert.rejects(invoke(handler, profile, { reason: 'Receipt unreadable' }), { status: 403 });
    }
  }
  assert.equal(writes.length, 0);
});
test('already approved and rejected submissions cannot be reviewed again', async () => {
  for (const state of ['approved', 'rejected']) {
    order.payment_verification_status = state;
    for (const handler of [approvePaymentVerification, rejectPaymentVerification]) {
      await assert.rejects(invoke(handler, { id: 'farmer', role: 'farmer' }, { reason: 'Receipt unreadable' }), { status: 400 });
    }
  }
  assert.equal(writes.length, 0);
});
test('existing Farmer rejection still requires a nonempty reason and preserves the existing payload', async () => {
  await assert.rejects(invoke(rejectPaymentVerification, { id: 'farmer' }, { reason: '  ' }), { status: 400 });
  assert.equal(writes.length, 0);
  await invoke(rejectPaymentVerification, { id: 'farmer' }, { reason: 'Receipt unreadable: Upload the full image.' });
  assert.equal(writes[0].patch.payment_verification_status, 'rejected');
  assert.equal(writes[0].patch.payment_rejection_reason, 'Receipt unreadable: Upload the full image.');
});
