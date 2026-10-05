import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadFrontend } from './helpers/loadFrontend.mjs';

const url = (path) => new URL(`../src/${path}`, import.meta.url).href;
const [position, store, routing] = await loadFrontend([
  url('utils/liveTrackingPosition.js'), url('services/liveTrackingStore.js'), url('services/trafficNavigation.js'),
]);
const plain = (value) => JSON.parse(JSON.stringify(value));
const flush = () => new Promise(setImmediate);
const origin = { lat: 10.31, lng: 123.91 };
const destination = { lat: 10.32, lng: 123.93 };
const time = Date.now();
const fix = (point = origin, timestamp = time) => ({ ...point, accuracy: 8, heading: null, speed: null, timestamp });
const route = (from = origin, to = destination) => ({ points: [from, to], distanceKm: 2.8, durationMinutes: 8, hasTrafficData: false });

test('seconds, milliseconds and ISO timestamps preserve valid zero/string coordinates without heading/speed', () => {
  for (const timestamp of [time, String(time), time / 1000, new Date(time).toISOString()]) {
    const value = position.normalizeLivePosition({ ...fix({ lat: '0', lng: '123.5' }), timestamp });
    assert.equal(value.lat, 0);
    assert.equal(value.lng, 123.5);
    assert.equal(value.timestamp, time);
    assert.equal(value.heading, null);
    assert.equal(value.speed, null);
    assert.equal(position.isFreshLivePosition(value, time), true);
  }
  for (const lat of [null, undefined, '', 'bad', 123]) {
    assert.equal(position.normalizeLivePosition(fix({ lat, lng: 10 })), null);
  }
  assert.equal(position.normalizeLivePosition({ ...fix(), accuracy: 180 }), null);
});

test('server/client clock differences preserve sample age; stale samples stay stale', () => {
  const serverNow = time + 3600000;
  for (const age of [2000, 90000, 240000]) {
    const value = position.normalizeLivePosition({ ...fix(), locationUpdatedAt: serverNow - age }, { serverNow, receivedAt: time });
    assert.equal(value.observedAt, time - age);
    assert.equal(position.isFreshLivePosition(value, time), age <= 180000);
  }
});

test('one order position rejects older socket/persisted updates and isolates orders', () => {
  store.clearLiveOrderPositions();
  let updates = 0;
  const unsubscribe = store.subscribeLiveOrderPosition('A', () => updates++);
  store.publishLiveOrderPosition('A', fix(), { source: 'gps' });
  store.publishLiveOrderPosition('A', fix(destination, time - 1000));
  store.publishLiveOrderPosition('A', { ...destination, locationUpdatedAt: time - 500 }, { source: 'persisted' });
  assert.equal(store.getLiveOrderPosition('A').lat, origin.lat);
  assert.equal(store.getLiveOrderPosition('B'), null);
  store.publishLiveOrderPosition('A', fix(destination, time + 1000), { source: 'gps' });
  assert.equal(store.getLiveOrderPosition('A').lat, destination.lat);
  assert.equal(updates, 2);
  unsubscribe();
});

test('join snapshot corrects freshness of equal persisted coordinates across clock skew', () => {
  store.clearLiveOrderPositions();
  const serverNow = time - 3600000;
  const payload = { ...origin, locationUpdatedAt: serverNow - 1000 };
  store.publishLiveOrderPosition('A', payload, { source: 'persisted' });
  store.publishLiveOrderPosition('A', payload, { serverNow, receivedAt: time });
  assert.equal(position.isFreshLivePosition(store.getLiveOrderPosition('A'), time), true);
});

test('fresh phone GPS supersedes a server-clock-ahead snapshot instead of leaving the farmer at old coordinates', () => {
  for (const source of ['persisted', 'socket']) {
    store.clearLiveOrderPositions();
    const serverNow = time + 3600000;
    store.publishLiveOrderPosition('A', { ...origin, locationUpdatedAt: serverNow - 1000 },
      { source, ...(source === 'socket' ? { serverNow, receivedAt: time } : {}) });
    const live = store.publishLiveOrderPosition('A', fix(destination), { source: 'gps' });
    assert.equal(live.lat, destination.lat);
    assert.equal(live.lng, destination.lng);
    assert.equal(live.source, 'gps');
    assert.equal(position.isFreshLivePosition(live, time), true);
  }
});

test('a stale local sample cannot supersede a fresh server snapshot', () => {
  store.clearLiveOrderPositions();
  store.publishLiveOrderPosition('A', { ...origin, locationUpdatedAt: time }, { serverNow: time });
  store.publishLiveOrderPosition('A', fix(destination, time - 240000), { source: 'gps' });
  assert.equal(store.getLiveOrderPosition('A').lat, origin.lat);
});

function navigator(fetchRoutes = async (from, to) => [route(from, to)]) {
  const calls = [];
  let clock = time;
  let state;
  const controller = routing.createTrafficNavigator({ now: () => clock,
    fetchRoutes: (...args) => { calls.push(plain(args)); return fetchRoutes(...args); }, onChange: (next) => { state = next; } });
  const inputs = { origin, destination, active: true, enabled: true };
  return { calls, controller, inputs, state: () => state, advance: (ms) => { clock += ms; }, clock: () => clock };
}

test('90-second GPS fix formerly accepted by marker and rejected by route now routes immediately', async () => {
  const nav = navigator();
  nav.controller.update({ ...nav.inputs, position: fix(origin, time - 90000) });
  await flush();
  assert.deepEqual(nav.calls, [[origin, destination]]);
  assert.equal(nav.state().selected.durationMinutes, 8);
  assert.equal(nav.state().selected.distanceKm, 2.8);
  assert.equal(nav.state().stale, false);
  assert.equal(nav.state().message, '');
});

test('first GPS fix supersedes an in-flight profile preview immediately', async () => {
  const resolvers = [];
  const nav = navigator((from, to) => new Promise((resolve) => resolvers.push(() => resolve([route(from, to)]))));
  nav.controller.update(nav.inputs);
  const live = { lat: 10.315, lng: 123.919 };
  nav.controller.update({ ...nav.inputs, position: fix(live) });
  assert.deepEqual(nav.calls, [[origin, destination], [live, destination]]);
  resolvers[1]();
  await flush();
  resolvers[0]();
  await flush();
  assert.deepEqual(plain(nav.state().selected.points[0]), live);
  assert.equal(nav.state().stale, false);
});

test('movement is throttled; off-route updates use the latest GPS and unchanged buyer destination', async () => {
  const nav = navigator();
  nav.controller.update({ ...nav.inputs, position: fix() });
  await flush();
  nav.advance(1000);
  const live = { lat: 10.34, lng: 123.92 };
  nav.controller.update({ ...nav.inputs, position: fix(live, nav.clock()) });
  assert.equal(nav.calls.length, 1);
  nav.advance(30000);
  nav.controller.update({ ...nav.inputs, position: fix(live, nav.clock()) });
  await flush();
  assert.equal(nav.calls.length, 2);
  assert.deepEqual(nav.calls[1], [live, destination]);
  assert.equal(nav.state().stale, false);
});

test('ordinary progress along a sparse Google geometry retains usable ETA', async () => {
  const nav = navigator();
  nav.controller.update({ ...nav.inputs, position: fix() });
  await flush();
  nav.advance(31000);
  const halfway = { lat: 10.315, lng: 123.92 };
  nav.controller.update({ ...nav.inputs, position: fix(halfway, nav.clock()) });
  await flush();
  assert.equal(nav.state().stale, false);
  assert.deepEqual(plain(nav.state().selected.points[0]), halfway);
});

test('stale location never falls back to the farm or creates a fake line', async () => {
  const nav = navigator();
  nav.controller.update({ ...nav.inputs, position: fix(destination, time - 240000) });
  await flush();
  assert.equal(nav.calls.length, 0);
  assert.equal(nav.state().selected, null);
  assert.equal(nav.state().stale, true);
});

test('routing failures keep actual Google geometry and cannot manufacture an ETA', async () => {
  let fail = false;
  const nav = navigator(async (from, to) => fail ? null : [route(from, to)]);
  nav.controller.update({ ...nav.inputs, position: fix() });
  await flush();
  fail = true;
  nav.advance(121000);
  nav.controller.update({ ...nav.inputs, position: fix(origin, nav.clock()) });
  await flush();
  assert.deepEqual(plain(nav.state().selected.points), [origin, destination]);
  assert.equal(nav.state().stale, true);
});

test('order/destination changes ignore old pending route results', async () => {
  const resolvers = [];
  const nav = navigator((from, to) => new Promise((resolve) => resolvers.push(() => resolve([route(from, to)]))));
  nav.controller.update({ ...nav.inputs, position: fix() });
  const nextDestination = { lat: 10.4, lng: 124 };
  nav.controller.update({ ...nav.inputs, position: fix(), destination: nextDestination });
  resolvers[1](); await flush();
  resolvers[0](); await flush();
  assert.deepEqual(plain(nav.state().selected.points.at(-1)), nextDestination);
});
