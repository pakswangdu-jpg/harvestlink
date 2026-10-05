import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadFrontend } from './helpers/loadFrontend.mjs';

const url = (path) => new URL(`../src/${path}`, import.meta.url).href;
const flush = () => new Promise(setImmediate);

for (const role of ['buyer', 'stakeholder']) {
  test(`${role} pickup location resumes once after granting permission`, async () => {
    const effects = [];
    const errors = [];
    const lookedUp = [];
    let stateIndex = 0;
    let watches = 0;
    let cleared = 0;
    let onError;
    const socket = { connected: true, on() {}, off() {}, emit() {} };
    const [hook] = await loadFrontend([url('hooks/useBuyerActivePickupSharing.js')], {
      window: { addEventListener() {}, removeEventListener() {} },
      navigator: { onLine: true, geolocation: {
        watchPosition(success, failure, options) {
          assert.equal(options.enableHighAccuracy, true);
          onError = failure; watches++; return watches;
        },
        clearWatch() { cleared++; },
      } },
      setInterval: () => 1, clearInterval() {},
    }, {
      react: {
        useState: (value) => { const index = stateIndex++; return [value, (next) => { if (index === 1) errors.push(next); }]; },
        useRef: (value) => ({ current: value }), useEffect: (effect, deps) => effects.push({ effect, deps }),
      },
      [url('lib/socketClient.js')]: { getSocket: () => socket },
      [url('lib/supabaseClient.js')]: { supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } },
      [url('services/orderService.js')]: { getOrdersByBuyer: async (id) => {
        lookedUp.push(id);
        return [{ id: 'pickup-1', status: 'confirmed', deliveryStatus: 'ready_for_pickup', deliveryMethod: 'buyer_pickup' }];
      } },
    });
    hook.useBuyerActivePickupSharing(`${role}-id`, 'granted');
    const cleanups = effects.map(({ effect }) => effect());
    await flush();
    const grant = effects.find(({ deps }) => deps?.length === 1 && deps[0] === 'granted').effect;
    grant();
    assert.deepEqual(lookedUp, [`${role}-id`]);
    assert.equal(watches, 1);
    onError({ code: 1, PERMISSION_DENIED: 1 });
    assert.equal(cleared, 1);
    assert.match(errors.at(-1), /permission was denied/);
    grant();
    grant();
    assert.equal(watches, 2);
    assert.equal(errors.at(-1), '');
    cleanups.forEach((cleanup) => cleanup?.());
    assert.equal(cleared, 2);
  });
}
