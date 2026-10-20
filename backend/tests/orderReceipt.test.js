import assert from 'node:assert/strict';
import { beforeEach, mock, test } from 'node:test';

let order;
const reads = [];
mock.module('../src/lib/supabaseClient.js', { namedExports: { supabaseAdmin: {
  from(table) {
    reads.push(table);
    const row = table === 'orders' ? order : table === 'profiles' ? { email: 'registered@example.test' }
      : table === 'deliveries' ? { courier_company: 'Lalamove', booking_reference: 'BOOK-123' }
        : { occurred_at: '2026-10-20T08:35:00Z' };
    return { select() { return this; }, eq() { return this; }, order() { return this; }, limit() { return this; },
      single: async () => ({ data: row }), maybeSingle: async () => ({ data: row }) };
  },
} } });
const { getOrderReceipt } = await import('../src/controllers/orders.controller.js');
beforeEach(() => {
  reads.length = 0;
  order = { id: 'abcd1234', buyer_id: 'buyer', farmer_id: 'farmer', buyer_name: 'Snapshot Buyer', farmer_name: 'Snapshot Farmer', farmer_farm_name: 'Snapshot Farm',
    product_name: 'Snapshot Produce', unit_price: 12, quantity: 3, unit: 'kg', delivery_fee: 30, total_amount: 66,
    payment_method: 'gcash', payment_status: 'paid', payment_verification_status: 'approved', status: 'completed',
    delivery_method: 'courier', delivery_status: 'delivered', completed_at: '2026-10-20T08:35:00Z' };
});
async function get(profile) {
  let receipt;
  await getOrderReceipt({ params: { id: order.id }, profile }, { setHeader(key, value) { assert.equal(key, 'Cache-Control'); assert.equal(value, 'no-store'); }, json(value) { receipt = value; } });
  return receipt;
}
test('Buyer receipt uses saved snapshots and registered email, never live product pricing', async () => {
  const receipt = await get({ id: 'buyer', role: 'buyer' });
  assert.equal(receipt.total, 66);
  assert.equal(receipt.buyer.email, 'registered@example.test');
  assert.equal(receipt.seller.name, 'Snapshot Farmer');
  assert.equal(receipt.delivery.method, 'Lalamove');
  assert.deepEqual(reads, ['orders', 'profiles', 'deliveries']);
});
test('owning Farmer can read the receipt without disclosure of the Buyer registered email', async () => {
  const receipt = await get({ id: 'farmer', role: 'farmer' });
  assert.equal(receipt.buyer.email, null);
  assert.ok(!reads.includes('profiles'));
});
test('unrelated accounts cannot access a receipt or its contact details', async () => {
  await assert.rejects(get({ id: 'other', role: 'buyer' }), { status: 403 });
  assert.deepEqual(reads, ['orders']);
});
test('legacy receipts use actual recorded final events, never order modification time', async () => {
  delete order.completed_at;
  order.updated_at = '2099-01-01T00:00:00Z';
  const receipt = await get({ id: 'buyer', role: 'buyer' });
  assert.equal(receipt.completedAt, '2026-10-20T08:35:00Z');
});
