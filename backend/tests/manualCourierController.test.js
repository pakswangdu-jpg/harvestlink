import assert from 'node:assert/strict';
import { beforeEach, mock, test } from 'node:test';

let order;
let delivery;
let rpcError;
const calls = [];
const notifications = [];
mock.module('../src/lib/supabaseClient.js', { namedExports: { supabaseAdmin: {
  from(table) {
    let patch;
    return { select() { return this; }, eq() { return this; },
      in: async () => ({ data: [], error: null }),
      update(value) { patch = value; return this; },
      insert: async () => ({ error: null }),
      single: async () => ({ data: order, error: null }),
      maybeSingle: async () => {
        if (patch && table === 'orders') order = { ...order, ...patch };
        return { data: table === 'deliveries' ? delivery : order, error: null };
      },
    };
  },
  async rpc(name, args) {
    calls.push({ name, args });
    if (rpcError) return { error: rpcError };
    if (name === 'transition_marketplace_order') return { data: { ...order, status: args.p_action }, error: null };
    const handed = args.p_action === 'handover';
    return { data: {
      order: { ...order, ...(handed ? { delivery_status: 'out_for_delivery', transit_started_at: '2026-10-17T08:00:00Z' } : {}) },
      delivery: { ...delivery, ...args.p_details, delivery_status: handed ? 'out_for_delivery' : delivery.delivery_status },
    }, error: null };
  },
} } });
mock.module('../src/lib/notify.js', { namedExports: { createNotification: async (notice) => { notifications.push(notice); } } });
mock.module('../src/lib/lalamoveClient.js', { namedExports: {
  getQuotation: async () => { throw new Error('The manual booking flow must not call the Lalamove API.'); },
  createOrder: async () => { throw new Error('The manual booking flow must not call the Lalamove API.'); },
} });
const { getDelivery, bookDelivery, updateDelivery, updateDeliveryStatus } = await import('../src/controllers/deliveries.controller.js');
const { advanceDelivery, updateOrderStatus } = await import('../src/controllers/orders.controller.js');
const farmer = { id: 'farmer', role: 'farmer' };
const valid = { orderId: 'order', bookingReference: ' PH-123 ', trackingUrl: ' https://share.lalamove.com/?token=ABC%2F123 ', vehiclePlate: 'abc 123' };
beforeEach(() => {
  calls.length = 0; notifications.length = 0; rpcError = null;
  order = { id: 'order', farmer_id: 'farmer', buyer_id: 'buyer', delivery_method: 'courier', delivery_status: 'packed', status: 'confirmed', payment_method: 'cod', payment_status: 'pending' };
  delivery = { id: 'delivery', order_id: 'order', courier_company: 'Lalamove', delivery_status: 'booked', tracking_url: valid.trackingUrl.trim(), booking_reference: 'PH-123' };
});
async function invoke(handler, body = valid, profile = farmer) {
  const res = { status(value) { this.code = value; return this; }, json(data) { this.body = data; } };
  await handler({ params: { orderId: 'order', id: 'order' }, body, profile }, res);
  return res;
}

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
