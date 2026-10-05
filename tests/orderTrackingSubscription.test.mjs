import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadFrontend } from './helpers/loadFrontend.mjs';

const url = (path) => new URL(`../src/${path}`, import.meta.url).href;
const flush = () => new Promise(setImmediate);

test('tracking subscriber joins canonical order, consumes snapshot and updates, isolates other orders and removes listeners', async () => {
  const effects = [];
  const listeners = new Map();
  const emitted = [];
  const subscribers = [];
  const now = Date.now();
  const socket = {
    connected: true,
    on(name, callback) { listeners.set(name, callback); },
    off(name, callback) { assert.equal(listeners.get(name), callback); listeners.delete(name); },
    timeout() { return this; },
    emit(event, payload, callback) {
      emitted.push({ event, payload });
      callback(null, { ok: true, serverNow: now, location: {
        orderId: payload.orderId, lat: 10.31, lng: 123.91, locationUpdatedAt: now - 1000,
      } });
    },
  };
  const [hook, store] = await loadFrontend([url('hooks/useOrderTrackingSocket.js'), url('services/liveTrackingStore.js')],
    { setInterval: () => 1, clearInterval() {} }, {
      react: {
        useState: (value) => [value, () => {}], useCallback: (value) => value,
        useEffect: (effect) => effects.push(effect),
        useSyncExternalStore: (subscribe, snapshot) => { subscribers.push(subscribe(() => {})); return snapshot(); },
      },
      [url('lib/socketClient.js')]: { getSocket: () => socket },
      [url('lib/supabaseClient.js')]: { supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'buyer' } } }) } } },
    });
  hook.useOrderTrackingSocket('order-uuid', { id: 'order-uuid' });
  const cleanups = effects.map((effect) => effect());
  await flush();
  assert.equal(emitted[0].event, 'join-order');
  assert.equal(emitted[0].payload.orderId, 'order-uuid');
  assert.equal(store.getLiveOrderPosition('order-uuid').lat, 10.31);
  listeners.get('location-update')({ orderId: 'other-order', lat: 11, lng: 124, timestamp: now });
  assert.equal(store.getLiveOrderPosition('order-uuid').lat, 10.31);
  listeners.get('location-update')({ orderId: 'order-uuid', lat: 10.32, lng: 123.92, timestamp: now, serverNow: now });
  assert.equal(store.getLiveOrderPosition('order-uuid').lat, 10.32);
  listeners.get('connect')();
  await flush();
  assert.equal(emitted.length, 2);
  assert.equal(store.getLiveOrderPosition('order-uuid').lat, 10.32); // Old replay cannot undo movement.
  cleanups.forEach((cleanup) => cleanup?.());
  subscribers.forEach((unsubscribe) => unsubscribe());
  assert.equal(listeners.size, 0);
  assert.equal(store.getLiveOrderPosition('order-uuid'), null);
});
