import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadFrontend } from './helpers/loadFrontend.mjs';

const url = (path) => new URL(`../src/${path}`, import.meta.url).href;
const flush = () => new Promise(setImmediate);

async function harness(locationPermission) {
  const effects = [];
  const intervals = new Map();
  const socketListeners = new Map();
  const sends = [];
  const local = [];
  const errors = [];
  let gps;
  let gpsError;
  let watches = 0;
  let cleared = 0;
  let stateIndex = 0;
  const socket = {
    connected: true,
    on(event, callback) { socketListeners.set(event, callback); },
    off(event) { socketListeners.delete(event); },
    timeout() { return this; },
    emit(event, payload, callback) {
      if (event === 'farmer-location') sends.push(payload);
      callback?.(null, { ok: true });
    },
  };
  const [module] = await loadFrontend([url('hooks/useFarmerActiveDeliverySharing.js')], {
    window: { addEventListener() {}, removeEventListener() {} },
    navigator: { onLine: true, geolocation: {
      watchPosition(success, failure, options) {
        assert.equal(options.enableHighAccuracy, true);
        gps = success; gpsError = failure; watches++; return 1;
      },
      clearWatch() { cleared++; },
    } },
    setInterval(callback, ms) { intervals.set(ms, callback); return ms; },
    clearInterval(id) { intervals.delete(id); },
  }, {
    react: {
      useState: (initial) => { const index = stateIndex++; return [initial, (value) => { if (index === 1) errors.push(value); }]; },
      useRef: (value) => ({ current: value }), useEffect: (effect) => effects.push(effect),
    },
    [url('lib/supabaseClient.js')]: { supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'farmer' } } }) } } },
    [url('lib/socketClient.js')]: { getSocket: () => socket },
    [url('services/orderService.js')]: { getOrdersByFarmer: async () => [
      { id: 'order-A', status: 'confirmed', deliveryStatus: 'out_for_delivery', deliveryMethod: 'farmer_delivery' },
    ] },
    [url('services/liveTrackingStore.js')]: { publishLiveOrderPosition: (id, position) => local.push({ id, ...position }), clearLiveOrderPositions() {} },
  });
  module.useFarmerActiveDeliverySharing('farmer', locationPermission);
  const cleanups = effects.map((effect) => effect());
  await flush();
  return { gps: (...args) => gps(...args), gpsError: (...args) => gpsError(...args), sends, local, errors, intervals, socket,
    reconnect: () => socketListeners.get('connect')(),
    permissionGranted: () => effects.at(-1)(),
    watches: () => watches, cleared: () => cleared, cleanup: () => cleanups.forEach((cleanup) => cleanup?.()) };
}

test('existing single high-accuracy watcher publishes GPS locally before emitting identical coordinates without compass/speed', async () => {
  const h = await harness();
  const timestamp = Date.now();
  const coords = { latitude: 10.31, longitude: 123.91, accuracy: 8, heading: null, speed: null };
  h.gps({ coords, timestamp });
  assert.equal(h.local.length, 1);
  assert.equal(h.sends.length, 0); // Local update precedes asynchronous auth/join.
  await flush();
  assert.equal(h.sends.length, 1);
  assert.equal(h.sends[0].lat, h.local[0].lat);
  assert.equal(h.sends[0].lng, h.local[0].lng);
  assert.equal(h.sends[0].timestamp, timestamp);
  assert.equal(h.sends[0].heading, null);
  assert.equal(h.sends[0].speed, null);
  await h.intervals.get(6000)();
  assert.equal(h.watches(), 1);
  h.cleanup();
  assert.equal(h.cleared(), 1);
});

test('farmer sharing derives vehicle heading from movement instead of phone rotation', async () => {
  const h = await harness();
  const timestamp = Date.now();
  const base = { latitude: 10.31, longitude: 123.91, accuracy: 8, heading: null, speed: 1.2 };
  h.gps({ coords: base, timestamp });
  await flush();
  h.gps({ coords: { ...base, longitude: 123.911 }, timestamp: timestamp + 5000 });
  await flush();
  assert.equal(Math.round(h.local.at(-1).heading), 90);
  assert.equal(Math.round(h.sends.at(-1).heading), 90);
  h.cleanup();
});

test('offline GPS updates stay local; reconnect sends newest sample with original timestamp instead of buffering old fixes', async () => {
  const h = await harness();
  h.socket.connected = false;
  const timestamp = Date.now();
  const coords = { latitude: 10.31, longitude: 123.91, accuracy: 8, heading: null, speed: null };
  h.gps({ coords, timestamp: timestamp - 1000 });
  h.gps({ coords: { ...coords, latitude: 10.32 }, timestamp });
  assert.equal(h.sends.length, 0);
  assert.equal(h.local.at(-1).lat, 10.32);
  h.socket.connected = true;
  h.reconnect();
  await flush();
  assert.equal(h.sends.length, 1);
  assert.equal(h.sends[0].lat, 10.32);
  assert.equal(h.sends[0].timestamp, timestamp);
  h.cleanup();
});

test('permission denial retains the error and does not spawn repeated GPS watchers', async () => {
  const h = await harness();
  h.gpsError({ code: 1 });
  await h.intervals.get(6000)();
  assert.equal(h.watches(), 1);
  assert.match(h.errors.at(-1), /permission was denied/);
  h.cleanup();
});

test('granting location after denial restarts the existing farmer watcher once', async () => {
  const h = await harness('granted');
  h.gpsError({ code: 1 });
  assert.equal(h.cleared(), 1);
  h.permissionGranted();
  assert.equal(h.watches(), 2);
  h.permissionGranted();
  assert.equal(h.watches(), 2);
  assert.equal(h.errors.at(-1), '');
  h.cleanup();
});
