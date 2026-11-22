import assert from 'node:assert/strict';
import { beforeEach, mock, test } from 'node:test';

let order;
let delivery;
let rpcError;
const calls = [];
const notifications = [];
let trackingWrite;
mock.module('../src/lib/supabaseClient.js', { namedExports: { supabaseAdmin: {
  from(table) {
    let patch;
    const filters = [];
    return { select() { return this; }, eq(...filter) { filters.push(filter); return this; },
      or() { return this; }, order() { return this; },
      then(resolve) { return Promise.resolve({ data: table === 'orders' ? [order] : [], error: null }).then(resolve); },
      in: async () => ({ data: [], error: null }),
      update(value) { patch = value; return this; },
      insert: async () => ({ error: null }),
      single: async () => ({
        data: table === 'products'
          ? { id: 'product', farmer_id: 'farmer', status: 'active', quantity: 10, price: 50, original_price: 60, wholesale_price: 45, wholesale_min_quantity: 2, name: 'Cabbage', unit: 'kg', location: 'Cebu City' }
          : table === 'profiles' ? { name: 'Farmer', gcash_account_name: 'Farmer', gcash_qr_url: '/qr.png' } : order,
        error: null,
      }),
      maybeSingle: async () => {
        if (patch && table === 'orders') {
          trackingWrite = { patch, filters };
          order = { ...order, ...patch };
        }
        return { data: table === 'deliveries' ? delivery : order, error: null };
      },
    };
  },
  async rpc(name, args) {
    calls.push({ name, args });
    if (rpcError) return { error: rpcError };
    if (name === 'create_lalamove_quote_order') return { data: { ...args.p_order, id: 'order', lalamove_quote_status: 'pending' }, error: null };
    if (name === 'handover_lalamove_share_link_order') return { data: { order: { ...order, delivery_status: 'out_for_delivery' }, delivery: null }, error: null };
    if (name === 'transition_marketplace_order') return { data: { ...order, status: args.p_action }, error: null };
    const handed = args.p_action === 'handover';
    return { data: {
      order: { ...order, ...(handed ? { delivery_status: 'out_for_delivery', transit_started_at: '2026-10-17T08:00:00Z' } : {}) },
      delivery: { ...delivery, ...args.p_details, delivery_status: handed ? 'out_for_delivery' : delivery.delivery_status },
    }, error: null };
  },
} } });
mock.module('../src/lib/notify.js', { namedExports: { createNotification: async (notice) => { notifications.push(notice); } } });
mock.module('../src/lib/messageTraceability.js', { namedExports: { linkProductConversationToOrder: async () => {} } });
const { getDelivery, bookDelivery, updateDelivery, updateDeliveryStatus, updateManualLalamoveTrackingLink } = await import('../src/controllers/deliveries.controller.js');
const { advanceDelivery, createOrder, getOrder, listOrders, updateOrderStatus } = await import('../src/controllers/orders.controller.js');
const farmer = { id: 'farmer', role: 'farmer' };
const valid = { orderId: 'order', bookingReference: ' PH-123 ', trackingUrl: ' https://share.lalamove.com/?token=ABC%2F123 ', vehiclePlate: 'abc 123' };
beforeEach(() => {
  calls.length = 0; notifications.length = 0; rpcError = null;
  trackingWrite = null;
  order = { id: 'order', farmer_id: 'farmer', buyer_id: 'buyer', delivery_method: 'courier', delivery_status: 'packed', status: 'confirmed', payment_method: 'cod', payment_status: 'pending' };
  delivery = { id: 'delivery', order_id: 'order', courier_company: 'Lalamove', delivery_status: 'booked', tracking_url: valid.trackingUrl.trim(), booking_reference: 'PH-123' };
});
async function invoke(handler, body = valid, profile = farmer) {
  const res = { headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(value) { this.code = value; return this; }, json(data) { this.body = data; } };
  await handler({ params: { orderId: 'order', id: 'order' }, query: {}, body, profile }, res);
  return res;
}

test('manual tracking only updates the owning farmer’s courier order and preserves booking and status', async () => {
  for (const profile of [{ id: 'buyer', role: 'stakeholder' }, { id: 'other', role: 'farmer' }, { id: 'farmer', role: 'admin' }]) {
    await assert.rejects(invoke(updateManualLalamoveTrackingLink, valid, profile), { status: 403 });
  }
  await assert.rejects(invoke(updateManualLalamoveTrackingLink, { trackingUrl: 'https://web.lalamove.com/' }), { status: 400 });
  assert.equal(trackingWrite, null);
  order.delivery_method = 'buyer_pickup';
  await assert.rejects(invoke(updateManualLalamoveTrackingLink, valid), { status: 400 });
  order.delivery_method = 'courier';
  const saved = await invoke(updateManualLalamoveTrackingLink, valid);
  assert.equal(saved.body.trackingUrl, valid.trackingUrl.trim());
  assert.equal(saved.headers['Cache-Control'], 'private, no-store');
  assert.deepEqual(trackingWrite, {
    patch: { manual_lalamove_tracking_url: valid.trackingUrl.trim() },
    filters: [['id', 'order'], ['farmer_id', 'farmer'], ['delivery_method', 'courier']],
  });
  assert.equal(order.delivery_status, 'packed');
  assert.equal(delivery.tracking_url, valid.trackingUrl.trim());
  assert.equal(calls.length, 0);
  const updated = 'https://share.lalamove.com/?token=updated';
  await invoke(updateManualLalamoveTrackingLink, { trackingUrl: updated });
  assert.equal(order.manual_lalamove_tracking_url, updated);
  await invoke(updateManualLalamoveTrackingLink, { trackingUrl: null });
  assert.equal(order.manual_lalamove_tracking_url, null);
  assert.equal(delivery.tracking_url, valid.trackingUrl.trim());
});

test('only the order participants receive the manual link in order details and history', async () => {
  const url = valid.trackingUrl.trim();
  order.manual_lalamove_tracking_url = url;
  for (const profile of [farmer, { id: 'buyer', role: 'buyer' }, { id: 'buyer', role: 'stakeholder' }]) {
    const detail = await invoke(getOrder, {}, profile);
    assert.equal(detail.body.manualLalamoveTrackingUrl, url);
    assert.equal(detail.headers['Cache-Control'], 'private, no-store');
    assert.equal((await invoke(listOrders, {}, profile)).body[0].manualLalamoveTrackingUrl, url);
  }
  const admin = { id: 'admin', role: 'admin' };
  assert.equal(Object.hasOwn((await invoke(getOrder, {}, admin)).body, 'manualLalamoveTrackingUrl'), false);
  assert.equal(Object.hasOwn((await invoke(listOrders, {}, admin)).body[0], 'manualLalamoveTrackingUrl'), false);
  await assert.rejects(invoke(getOrder, {}, { id: 'unrelated', role: 'stakeholder' }), { status: 403 });
  order.manual_lalamove_tracking_url = null;
  assert.equal((await invoke(getOrder, {}, { id: 'buyer', role: 'stakeholder' })).body.manualLalamoveTrackingUrl, null);
});

test('Lalamove checkout stores the discounted produce total for buyer GCash and stakeholder COD', async () => {
  for (const [role, paymentMethod] of [['buyer', 'gcash'], ['stakeholder', 'cod']]) {
    const res = await invoke(createOrder, {
      productId: 'product', quantity: 2, deliveryMethod: 'courier', deliveryMunicipality: 'Cebu City', paymentMethod, expectedTotal: 90,
    }, { id: 'buyer', name: 'Buyer', role });
    const { p_order: saved } = calls.at(-1).args;
    assert.equal(res.code, 201);
    assert.equal(res.body.lalamoveQuoteStatus, 'pending');
    assert.equal(saved.total_amount, 90);
    assert.equal(saved.delivery_fee, 0);
    assert.equal(saved.delivery_fee_tier, 'Arranged separately');
    assert.equal(saved.payment_method, paymentMethod);
    assert.equal(saved.payment_status, 'pending');
  }
});

test('a standalone share link selects the authorized physical handover workflow', async () => {
  order.manual_lalamove_tracking_url = valid.trackingUrl.trim();
  const res = await invoke(updateDeliveryStatus, { status: 'out_for_delivery' });
  assert.equal(res.body.order.deliveryStatus, 'out_for_delivery');
  assert.equal(res.body.delivery, null);
  assert.deepEqual(calls[0], { name: 'handover_lalamove_share_link_order', args: { p_actor: 'farmer', p_order: 'order' } });
});

test('booking requires a reference and safe official HTTPS link, while optional fields are validated as strings', async () => {
  for (const patch of [{ bookingReference: '' }, { bookingReference: {} }, { trackingUrl: 'javascript:alert(1)' }, { trackingUrl: 'https://example.com' }, { trackingUrl: [] }, { driverName: {} }, { vehiclePlate: '<x>' }]) {
    await assert.rejects(invoke(bookDelivery, { ...valid, ...patch }), (error) => error.status === 400);
  }
  assert.equal(calls.length, 0);
});
test('booking preserves Packed and the exact share URL and sends only a booking notification', async () => {
  const res = await invoke(bookDelivery);
  assert.equal(res.code, 201);
  assert.equal(res.body.order.deliveryStatus, 'packed');
  assert.equal(calls[0].args.p_action, 'book');
  assert.equal(calls[0].args.p_details.tracking_url, valid.trackingUrl.trim());
  assert.equal(calls[0].args.p_details.booking_reference, 'PH-123');
  assert.equal(calls[0].args.p_details.vehicle_plate_number, 'ABC 123');
  assert.equal(notifications[0].title, 'Lalamove courier booked');
  assert.equal(res.body.delivery.vehiclePlate, 'ABC 123');
});
test('only owning Farmer may book, edit or hand over; other methods are not modified', async () => {
  for (const profile of [{ id: 'buyer', role: 'buyer' }, { id: 'farmer', role: 'admin' }, { id: 'other', role: 'farmer' }]) {
    for (const handler of [bookDelivery, updateDelivery, updateDeliveryStatus]) await assert.rejects(invoke(handler, valid, profile), (error) => error.status === 403);
  }
  for (const method of ['farmer_delivery', 'buyer_pickup']) {
    order.delivery_method = method;
    await assert.rejects(invoke(bookDelivery), (error) => error.status === 400);
  }
  assert.equal(calls.length, 0);
});
test('Buyer and Admin can view courier details but unrelated accounts cannot', async () => {
  for (const profile of [farmer, { id: 'buyer', role: 'buyer' }, { id: 'admin', role: 'admin' }]) assert.equal((await invoke(getDelivery, {}, profile)).body.id, 'delivery');
  await assert.rejects(invoke(getDelivery, {}, { id: 'other', role: 'buyer' }), (error) => error.status === 403);
});
test('physical handover uses the atomic RPC and sends a distinct out-for-delivery notification', async () => {
  const res = await invoke(updateDeliveryStatus, { status: 'out_for_delivery' });
  assert.equal(res.body.order.deliveryStatus, 'out_for_delivery');
  assert.equal(res.body.delivery.deliveryStatus, 'out_for_delivery');
  assert.ok(res.body.order.transitStartedAt);
  assert.equal(calls[0].args.p_action, 'handover');
  assert.equal(notifications[0].title, 'Order is out for delivery');
});
test('Farmer narration cannot fabricate Delivered or bypass handover with Picked Up', async () => {
  for (const status of ['delivered', 'picked_up', 'booked', 'waiting_for_pickup']) await assert.rejects(invoke(updateDeliveryStatus, { status }), (error) => error.status === 400);
  assert.equal(calls.length, 0);
});
test('failed transitions send no notification and missing migration fails closed', async () => {
  rpcError = { code: '23514', message: 'Already handed over' };
  await assert.rejects(invoke(updateDeliveryStatus, { status: 'out_for_delivery' }), (error) => error.status === 409);
  rpcError = { code: 'PGRST202', message: 'Missing function' };
  await assert.rejects(invoke(bookDelivery), (error) => error.status === 503);
  assert.equal(notifications.length, 0);
});
test('confirming a courier order never calls automatic Lalamove booking', async () => {
  order.status = 'pending';
  const res = await invoke(updateOrderStatus, { status: 'confirmed' });
  assert.equal(res.body.status, 'confirmed');
  assert.equal(calls[0].name, 'transition_marketplace_order');
  assert.ok(notifications.some((notice) => notice.title === 'Courier booking needed'));
  assert.equal(notifications.some((notice) => notice.title === 'Courier booked'), false);
});
test('the general advance endpoint cannot bypass physical courier handover', async () => {
  await assert.rejects(invoke(advanceDelivery, {}), (error) => error.status === 400 && error.message.includes('physical handover'));
  assert.equal(order.delivery_status, 'packed');
  assert.equal(notifications.length, 0);
});
test('existing Preparing/Packed, Farmer Delivery, and Buyer Pickup progress remain unchanged', async () => {
  order.delivery_status = 'preparing';
  assert.equal((await invoke(advanceDelivery, {})).body.deliveryStatus, 'packed');
  order.delivery_method = 'farmer_delivery';
  const farmerDelivery = (await invoke(advanceDelivery, { plateNumber: 'abc 123' })).body;
  assert.equal(farmerDelivery.deliveryStatus, 'out_for_delivery');
  assert.equal(farmerDelivery.vehiclePlateNumber, 'ABC 123');
  order.delivery_method = 'buyer_pickup';
  order.delivery_status = 'preparing';
  assert.equal((await invoke(advanceDelivery, {})).body.deliveryStatus, 'ready_for_pickup');
  const pickedUp = (await invoke(advanceDelivery, {}, { id: 'buyer', role: 'buyer' })).body;
  assert.equal(pickedUp.deliveryStatus, 'picked_up');
  assert.equal(pickedUp.status, 'completed');
});
test('only the Buyer confirms courier receipt through the existing completion/payment process', async () => {
  order.delivery_status = 'out_for_delivery';
  await assert.rejects(invoke(advanceDelivery, {}), (error) => error.status === 403);
  const res = await invoke(advanceDelivery, {}, { id: 'buyer', role: 'buyer' });
  assert.equal(res.body.deliveryStatus, 'delivered');
  assert.equal(res.body.status, 'completed');
  assert.equal(res.body.paymentStatus, 'paid');
  assert.ok(res.body.paidAt);
});
