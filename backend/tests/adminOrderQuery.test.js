import assert from 'node:assert/strict';
import { test } from 'node:test';

test('admin monitoring queries use bounded reads without granting write capabilities', async (t) => {
  let calls = [];
  let error = null;
  t.mock.module('../src/lib/supabaseClient.js', { namedExports: { supabaseAdmin: {
    from(table) {
      calls.push(['from', table]);
      return {
        select(...args) { calls.push(['select', ...args]); return this; },
        eq(...args) { calls.push(['eq', ...args]); return this; },
        or(...args) { calls.push(['or', ...args]); return this; },
        gte(...args) { calls.push(['gte', ...args]); return this; },
        lt(...args) { calls.push(['lt', ...args]); return this; },
        order(...args) { calls.push(['order', ...args]); return this; },
        range(...args) { calls.push(['range', ...args]); return this; },
        then(resolve, reject) { return Promise.resolve({ data: [{ id: 'o1', status: 'confirmed', delivery_status: 'packed' }], count: 34, error }).then(resolve, reject); },
      };
    },
  } } });
  const { queryAdminOrders } = await import('../src/lib/adminOrderQuery.js');
  const admin = { role: 'admin' };
  t.beforeEach(() => { calls = []; error = null; });
  await t.test('pagination, separated lifecycle filters, dates and summary head counts', async () => {
    const result = await queryAdminOrders(admin, { page: '2', status: 'confirmed', deliveryStatus: 'packed', paymentMethod: 'gcash', paymentStatus: 'pending', deliveryMethod: 'buyer_pickup', from: '2026-10-01', to: '2026-10-12' });
    assert.deepEqual(calls.find((call) => call[0] === 'range'), ['range', 15, 29]);
    assert.ok(calls.some((call) => call[1] === 'delivery_status' && call[2] === 'packed'));
    assert.ok(calls.some((call) => call[1] === 'payment_method' && call[2] === 'gcash'));
    assert.ok(calls.some((call) => call[1] === 'payment_status' && call[2] === 'pending'));
    assert.deepEqual(calls.find((call) => call[0] === 'lt'), ['lt', 'created_at', '2026-10-12T16:00:00.000Z']);
    assert.equal(calls.filter((call) => call[0] === 'select' && call[2]?.head).length, 8);
    assert.equal(result.pageSize, 15);
    assert.equal(result.total, 34);
    assert.equal(result.rows[0].delivery_status, 'packed');
    assert.deepEqual(Object.keys(result.counts), ['all', 'pending', 'confirmed', 'completed', 'cancelled', 'rejected', 'preparing', 'out_for_delivery']);
  });
  await t.test('short and full order IDs are searched safely alongside saved names', async () => {
    await queryAdminOrders(admin, { page: '1', search: '#HL-A123BC' });
    const filter = calls.find((call) => call[0] === 'or')[1];
    assert.ok(filter.includes('buyer_name.ilike.'));
    assert.ok(filter.includes('farmer_name.ilike.'));
    assert.ok(filter.includes('product_name.ilike.'));
    assert.ok(filter.includes('id.gte.A123BC00-0000-0000-0000-000000000000'));
    assert.ok(filter.includes('id.lte.A123BCff-ffff-ffff-ffff-ffffffffffff'));
    calls = [];
    await queryAdminOrders(admin, { page: '1', search: 'Farm, (Cebu)' });
    assert.ok(calls.find((call) => call[0] === 'or')[1].includes('"%Farm, (Cebu)%"'));
  });
  await t.test('non-admin requests, invalid dates and enums never return order data', async () => {
    await assert.rejects(queryAdminOrders({ role: 'buyer' }, { page: '1' }), { status: 403 });
    for (const values of [{ page: '0' }, { page: 'NaN' }, { page: '1', status: 'packed' }, { page: '1', paymentMethod: 'stripe' }, { page: '1', from: '2026-02-30' }, { page: '1', from: '2026-10-12', to: '2026-10-01' }]) await assert.rejects(queryAdminOrders(admin, values), { status: 400 });
    error = { message: 'database unavailable' };
    await assert.rejects(queryAdminOrders(admin, { page: '1' }), { status: 500 });
  });
});
