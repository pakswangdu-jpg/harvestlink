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
        || ('location_updated_at' in filters && (row.location_updated_at ?? null) !== filters.location_updated_at)
        || (row.location_updated_at && row.location_updated_at >= update.location_updated_at)) return { data: null, error: null };
      Object.assign(row, update);
      return { data: { id: row.id }, error: null };
    };
    return {
      select() { return this; }, eq(key, value) { filters[key] = value; return this; },
      is(key, value) { filters[key] = value; return this; },
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

  // A newer overlapping sample retries against the committed totals, rather than losing an interval.
  const telemetryOrder = 'telemetry-order';
  rows.set(telemetryOrder, { ...rows.get(orderId), id: telemetryOrder,
    current_lat: 10.31, current_lng: 123.91, current_speed: 10, current_accuracy: 5,
    location_updated_at: new Date(Date.now() - 20000).toISOString(),
    tracked_distance_km: 1, tracked_duration_seconds: 100 });
  await emit(farmer, 'join-order', { orderId: telemetryOrder, token: 'farmer' });
  let releaseNewWrite;
  delayNextWrite = new Promise(resolve => { releaseNewWrite = resolve; });
  const newWrite = emit(farmer, 'farmer-location', { orderId: telemetryOrder, lat: 10.31, lng: 123.912,
    speed: 10, accuracy: 5, sampleAgeMs: 0 });
  await new Promise(resolve => setTimeout(resolve, 30));
  await emit(farmer, 'farmer-location', { orderId: telemetryOrder, lat: 10.31, lng: 123.911,
    speed: 10, accuracy: 5, sampleAgeMs: 10000 });
  releaseNewWrite();
  assert.equal((await newWrite).ok, true);
  const recorded = rows.get(telemetryOrder);
  assert.ok(recorded.tracked_duration_seconds > 119 && recorded.tracked_duration_seconds < 122);
  assert.ok(Math.abs(recorded.tracked_distance_km - (1 + (recorded.tracked_duration_seconds - 100) / 100)) < 0.0001);
  const totalsBeforeStaleSample = recorded.tracked_duration_seconds;
  await emit(farmer, 'farmer-location', { orderId: telemetryOrder, lat: 10.31, lng: 123.911,
    speed: 10, accuracy: 5, sampleAgeMs: 15000 });
  assert.equal(recorded.tracked_duration_seconds, totalsBeforeStaleSample);
});

test('buyer/stakeholder viewers cannot move the farmer or change driver presence; pickup keeps its own mover', async (t) => {
  const http = createServer();
  const io = setupOrderTrackingSocket(http, []);
  await new Promise(resolve => http.listen(0, '127.0.0.1', resolve));
  const clients = [];
  t.after(async () => {
    clients.forEach(client => client.disconnect());
    await new Promise(resolve => io.close(resolve));
  });
  const client = async (orderId, token) => {
    const socket = connect(`http://127.0.0.1:${http.address().port}`, { transports: ['websocket'], forceNew: true });
    clients.push(socket);
    await once(socket, 'connect');
    const joined = await emit(socket, 'join-order', { orderId, token });
    return { socket, joined };
  };
  const settle = () => new Promise(resolve => setTimeout(resolve, 30));

  for (const receiver of ['buyer', 'stakeholder']) {
    const orderId = `presence-${receiver}`;
    rows.set(orderId, {
      id: orderId, farmer_id: 'farmer', buyer_id: receiver, farmer_name: 'Farmer',
      delivery_method: 'farmer_delivery', status: 'confirmed', delivery_status: 'out_for_delivery',
      origin_municipality: 'Mandaue City', delivery_municipality: 'Mandaue City',
    });
    const { socket: farmer } = await client(orderId, 'farmer');
    const { socket: viewer } = await client(orderId, receiver);
    const { socket: unrelated, joined: denied } = await client(orderId, `${receiver}-unrelated`);
    assert.equal(denied.ok, false);
    unrelated.disconnect();
    const sample = { orderId, lat: 10.315, lng: 123.912, accuracy: 5, speed: 0, heading: 90, timestamp: Date.now() };
    const received = once(viewer, 'location-update');
    assert.equal((await emit(farmer, 'farmer-location', sample)).ok, true);
    const [location] = await received;
    assert.equal(location.lat, sample.lat);
    assert.equal(location.lng, sample.lng);
    assert.equal((await emit(viewer, 'farmer-location', { ...sample, lat: 10.4 })).ok, false);
    assert.equal((await emit(viewer, 'buyer-location', { ...sample, lat: 10.4 })).ok, false);

    const { socket: lateViewer, joined } = await client(orderId, receiver);
    assert.equal(joined.location.lat, sample.lat);
    assert.equal(joined.location.lng, sample.lng);
    const statuses = [];
    lateViewer.on('sharer-status', payload => statuses.push(payload));
    viewer.emit('share-status', { orderId, status: 'offline' });
    await settle();
    assert.equal(statuses.length, 0, 'a receiving viewer cannot publish farmer presence');
    viewer.disconnect();
    await settle();
    assert.equal(statuses.length, 0, 'closing a viewer must not mark the farmer offline');

    const { socket: secondFarmer } = await client(orderId, 'farmer');
    farmer.disconnect();
    await settle();
    assert.equal(statuses.length, 0, 'another connected farmer session still leads the delivery');
    const offline = once(lateViewer, 'sharer-status');
    secondFarmer.disconnect();
    assert.equal((await offline)[0].status, 'offline');
    assert.equal(rows.get(orderId).current_lat, sample.lat, 'offline retains the last confirmed point');
    lateViewer.disconnect();
  }

  const pickupId = 'pickup-presence';
  rows.set(pickupId, { id: pickupId, farmer_id: 'pickup-farmer', buyer_id: 'pickup-buyer',
    buyer_name: 'Pickup Buyer', delivery_method: 'buyer_pickup', status: 'confirmed', delivery_status: 'ready_for_pickup',
    origin_municipality: 'Mandaue City' });
  const { socket: pickupFarmer } = await client(pickupId, 'pickup-farmer');
  const { socket: pickupBuyer } = await client(pickupId, 'pickup-buyer');
  const pickupLocation = once(pickupFarmer, 'location-update');
  assert.equal((await emit(pickupBuyer, 'buyer-location', { orderId: pickupId, lat: 10.31, lng: 123.91 })).ok, true);
  assert.equal((await pickupLocation)[0].lat, 10.31);
  const pickupOffline = once(pickupFarmer, 'sharer-status');
  pickupBuyer.disconnect();
  assert.equal((await pickupOffline)[0].status, 'offline');
});
