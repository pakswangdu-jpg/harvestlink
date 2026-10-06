import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadFrontend } from './helpers/loadFrontend.mjs';

async function harness(rendering = 'VECTOR') {
  const listeners = new Map();
  const calls = [];
  const statuses = [];
  let resize;
  let disconnected = false;
  let size = { width: 600, height: 400 };
  let position = { lat: 10.31, lng: 123.91 };
  let heading = 358;
  const map = {
    addListener(event, callback) { listeners.set(event, callback); return { remove: () => listeners.delete(event) }; },
    panTo(center) { calls.push(['pan', center]); },
    getRenderingType: () => rendering,
    setHeading(value) { assert.ok(Number.isFinite(value)); calls.push(['heading', value]); },
    fitBounds() { calls.push(['fit']); listeners.get('zoom_changed')?.(); },
    getCenter: () => ({ lat: 10, lng: 120 }),
    setCenter(center) { calls.push(['center', center]); },
  };
  const [module] = await loadFrontend([new URL('../src/utils/liveMapCamera.js', import.meta.url).href], {
    ResizeObserver: class {
      constructor(callback) { resize = callback; }
      observe() {}
      disconnect() { disconnected = true; }
    },
  });
  const camera = module.createLiveMapCamera({ map, mapsApi: {
    RenderingType: { VECTOR: 'VECTOR' }, event: { trigger: () => calls.push(['resize']) },
  }, container: { getBoundingClientRect: () => size }, getPosition: () => position,
  getHeading: () => heading, onFollowChange: (status) => statuses.push(status) });
  return { camera, calls, statuses, listeners, resize: () => resize(), disconnected: () => disconnected,
    position: (value) => { position = value; }, heading: (value) => { heading = value; },
    size: (value) => { size = value; } };
}

test('repeated recenter follows the tracked driver and never changes zoom or recreates maps', async () => {
  const h = await harness();
  for (let i = 0; i < 10; i++) assert.equal(h.camera.resume(), true);
  h.position({ lat: 10.32, lng: 123.92 });
  h.camera.update();
  assert.equal(JSON.stringify(h.calls.at(-1)), JSON.stringify(['pan', { lat: 10.32, lng: 123.92 }]));
  assert.equal(h.calls.filter(([kind]) => kind === 'fit').length, 0);
  assert.ok(h.statuses.every(Boolean));
});

test('manual drag and zoom stop follow until recenter, without fitting or snapping back', async () => {
  const h = await harness();
  h.camera.fitOverview({});
  h.listeners.get('idle')();
  h.camera.resume();
  for (const event of ['dragstart', 'zoom_changed']) {
    h.listeners.get(event)();
    const count = h.calls.length;
    h.position({ lat: 10.34, lng: 123.94 });
    h.camera.update();
    assert.equal(h.calls.length, count);
    assert.equal(h.statuses.at(-1), false);
    h.camera.resume();
  }
  assert.equal(h.calls.filter(([kind]) => kind === 'fit').length, 1);
});

test('missing/invalid GPS, zero-sized containers and destroyed cameras cannot issue camera calls', async () => {
  const h = await harness();
  for (const position of [null, { lat: NaN, lng: 123 }, { lat: 91, lng: 0 }]) {
    h.position(position);
    assert.equal(h.camera.resume(), false);
  }
  h.position({ lat: 0, lng: 0 });
  h.size({ width: 600, height: 0 });
  assert.equal(h.camera.resume(), false);
  assert.equal(h.calls.length, 0);
  h.camera.destroy();
  h.size({ width: 600, height: 400 });
  assert.equal(h.camera.resume(), false);
  h.resize();
  assert.equal(h.calls.length, 0);
  assert.equal(h.listeners.size, 0);
  assert.equal(h.disconnected(), true);
});

test('camera heading filters small changes across north and ignores invalid heading', async () => {
  const h = await harness();
  h.camera.resume();
  for (const heading of [2, NaN, undefined, null]) { h.heading(heading); h.camera.update(); }
  assert.equal(h.calls.filter(([kind]) => kind === 'heading').length, 1);
  h.heading(8); h.camera.update();
  assert.equal(h.calls.at(-1)[1], 8);
});

test('raster maps remain north-up even with a configured map ID', async () => {
  const h = await harness('RASTER');
  h.camera.resume();
  assert.equal(h.calls.filter(([kind]) => kind === 'heading').length, 0);
});

test('resize preserves a manually panned view and follows the last driver location when resumed', async () => {
  const h = await harness();
  h.resize();
  assert.equal(h.calls.at(-1)[0], 'center');
  h.camera.resume();
  h.resize();
  assert.equal(h.calls.at(-1)[0], 'pan');
});
