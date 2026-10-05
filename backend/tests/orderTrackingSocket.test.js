import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mock, test } from 'node:test';
import { io as connect } from 'socket.io-client';

const rows = new Map();
let delayNextWrite = null;
mock.module('../src/lib/supabaseClient.js', { namedExports: { supabaseAdmin: {
  auth: { getUser: async (token) => ({ data: { user: { id: token } } }) },
  from(table) {
    const filters = {};
    let update;
    const execute = async () => {
      if (table === 'profiles') return { data: { id: filters.id, account_status: 'active' }, error: null };
      const row = rows.get(filters.id);
      if (!update) return { data: row ? { ...row } : null, error: null };
      const delay = delayNextWrite;
      delayNextWrite = null;
      if (delay) await delay;
      // Model the atomic timestamp/status predicates used by the real database update.
      if (!row || (filters.status && row.status !== filters.status)
        || (filters.delivery_status && row.delivery_status !== filters.delivery_status)
        || (row.location_updated_at && row.location_updated_at >= update.location_updated_at)) return { data: null, error: null };
      Object.assign(row, update);
      return { data: { id: row.id }, error: null };
    };
    return {
      select() { return this; }, eq(key, value) { filters[key] = value; return this; },
      update(value) { update = value; return this; },
      or(value) { assert.match(value, /location_updated_at\.lt\./); return this; },
      single: execute, maybeSingle: execute,
    };
  },
} } });
mock.module('../src/lib/notify.js', { namedExports: { createNotification: async () => {} } });
const { setupOrderTrackingSocket } = await import('../src/realtime/orderTracking.js');
const emit = (socket, event, payload) => new Promise((resolve, reject) => {
  socket.timeout(2000).emit(event, payload, (error, response) => error ? reject(error) : resolve(response));
});

test('real order room delivers exact GPS to farmer/buyer, replays late joins, and rejects stale/cross-order updates', async (t) => {
  const http = createServer();
  const io = setupOrderTrackingSocket(http, []);
  await new Promise((resolve) => http.listen(0, '127.0.0.1', resolve));
  const clients = [];
  t.after(async () => {
    clients.forEach((client) => client.disconnect());
    await new Promise((resolve) => io.close(resolve));
  });
  const client = async () => {
    const socket = connect(`http://127.0.0.1:${http.address().port}`, { transports: ['websocket'], forceNew: true });
    clients.push(socket);
    await once(socket, 'connect');
    return socket;
  };
  const orderId = 'canonical-order-uuid';
  rows.set(orderId, {
    id: orderId, farmer_id: 'farmer', buyer_id: 'buyer', farmer_name: 'Farmer',
    delivery_method: 'farmer_delivery', status: 'confirmed', delivery_status: 'out_for_delivery',
    origin_municipality: 'Mandaue City', delivery_municipality: 'Mandaue City',
  });
  rows.set('other-order', { ...rows.get(orderId), id: 'other-order' });
  const farmer = await client();
  const buyer = await client();
  const other = await client();
  assert.equal((await emit(farmer, 'join-order', { orderId, token: 'farmer' })).ok, true);
  assert.equal((await emit(buyer, 'join-order', { orderId, token: 'buyer' })).ok, true);
  assert.equal((await emit(other, 'join-order', { orderId, token: 'stranger' })).ok, false);
  await emit(other, 'join-order', { orderId: 'other-order', token: 'buyer' });
  let otherUpdates = 0;
  other.on('location-update', () => otherUpdates++);

  const sample = { orderId, lat: 10.315678, lng: 123.912345, accuracy: 7, heading: null, speed: null,
    timestamp: Date.now() + 3600000, sampleAgeMs: 2000 };
  const farmerUpdate = once(farmer, 'location-update');
  const buyerUpdate = once(buyer, 'location-update');
  assert.equal((await emit(farmer, 'farmer-location', sample)).ok, true);
  const [farmerPayload] = await farmerUpdate;
  const [buyerPayload] = await buyerUpdate;
  assert.deepEqual(buyerPayload, farmerPayload);
  assert.equal(buyerPayload.lat, sample.lat);
  assert.equal(buyerPayload.lng, sample.lng);
  assert.equal(buyerPayload.timestamp, sample.timestamp);
  assert.equal(buyerPayload.heading, null);
  assert.equal(buyerPayload.speed, null);
  assert.ok(Math.abs(buyerPayload.serverNow - Date.parse(buyerPayload.locationUpdatedAt) - 2000) < 1000);
  assert.equal(otherUpdates, 0);
  assert.equal(rows.get(orderId).current_lat, sample.lat);

  const lateBuyer = await client();
  const joined = await emit(lateBuyer, 'join-order', { orderId, token: 'buyer' });
  assert.equal(joined.location.lat, sample.lat);
  assert.equal(joined.location.lng, sample.lng);
  assert.equal(joined.location.locationUpdatedAt, buyerPayload.locationUpdatedAt);
  assert.ok(Number.isFinite(joined.serverNow));

  assert.equal((await emit(buyer, 'farmer-location', { ...sample, sampleAgeMs: 0 })).ok, false);
  assert.equal((await emit(farmer, 'farmer-location', { ...sample, sampleAgeMs: 240000 })).ok, false);
  assert.equal((await emit(farmer, 'farmer-location', { ...sample, lat: 123, lng: 10 })).ok, false);
  assert.equal((await emit(farmer, 'farmer-location', { ...sample, accuracy: 180 })).ok, false);
  assert.equal((await emit(farmer, 'farmer-location', { ...sample, sampleAgeMs: 120000 })).skipped, true);

  let releaseOldWrite;
  delayNextWrite = new Promise((resolve) => { releaseOldWrite = resolve; });
  const oldWrite = emit(farmer, 'farmer-location', { ...sample, lat: 10.316, sampleAgeMs: 1000 });
  // Let the first authenticated request reach its delayed database write.
  await new Promise((resolve) => setTimeout(resolve, 30));
  const moved = { ...sample, lat: 10.319, lng: 123.919, sampleAgeMs: 0, timestamp: sample.timestamp + 2000 };
  const movedUpdate = once(buyer, 'location-update');
  assert.equal((await emit(farmer, 'farmer-location', moved)).ok, true);
  assert.equal((await movedUpdate)[0].lat, moved.lat);
  releaseOldWrite();
  assert.equal((await oldWrite).skipped, true);
  assert.equal(rows.get(orderId).current_lat, moved.lat);
});
