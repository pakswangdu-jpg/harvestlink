import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { transformWithOxc } from 'vite';
import { loadFrontend } from './helpers/loadFrontend.mjs';

async function harness(vector = false, profiles = true, initialPosition = { lat: 10.31, lng: 123.91, heading: 358, speed: 2 }) {
  const slots = [];
  let index = 0;
  let pending = [];
  let dirty = false;
  let tree;
  let position = initialPosition;
  let connection = 'online';
  let navigationInputs;
  const maps = [];
  const markers = [];
  const routes = [];
  const calls = [];
  const container = { getBoundingClientRect: () => ({ width: 600, height: 400 }) };
  const navigation = { selected: null, alternatives: [], stale: true };
  const react = {
    createElement(type, props, ...children) {
      if (props?.ref) props.ref.current = container;
      return { type, props: { ...props, children } };
    },
    useRef(value) { const i = index++; return slots[i] ||= { current: value }; },
    useMemo(callback) { index++; return callback(); },
    useState(initial) {
      const i = index++;
      slots[i] ||= { value: typeof initial === 'function' ? initial() : initial };
      return [slots[i].value, (next) => {
        const value = typeof next === 'function' ? next(slots[i].value) : next;
        if (!Object.is(value, slots[i].value)) { slots[i].value = value; dirty = true; }
      }];
    },
    useEffect(callback, deps) {
      const i = index++;
      const previous = slots[i];
      if (!previous || !deps || deps.some((value, j) => !Object.is(value, previous.deps[j]))) {
        pending.push(() => { previous?.cleanup?.(); slots[i] = { deps, cleanup: callback() }; });
      }
    },
  };
  class MockMap {
    constructor() { this.listeners = new Map(); maps.push(this); }
    addListener(event, handler) { this.listeners.set(event, handler); return { remove: () => this.listeners.delete(event) }; }
    panTo(center) { calls.push(['pan', center]); }
    fitBounds() { calls.push(['fit']); this.listeners.get('zoom_changed')?.(); }
    getRenderingType() { return vector ? 'VECTOR' : 'RASTER'; }
    setHeading(heading) { assert.ok(Number.isFinite(heading)); calls.push(['heading', heading]); }
    setTilt() {}
    setOptions() {}
  }
  class Marker {
    constructor(options) { Object.assign(this, options); markers.push(this); }
    setMap(map) { this.map = map; }
    setPosition(value) { this.position = value; }
    setIcon(value) { this.icon = value; }
  }
  const mapsApi = { Map: MockMap, Marker, AdvancedMarkerElement: Marker,
    ControlPosition: { RIGHT_TOP: 1 },
    RenderingType: { VECTOR: 'VECTOR' }, Size: class {}, Point: class {},
    LatLngBounds: class { extend() {} },
    Polyline: class { constructor() { routes.push(this); } setMap() {} }, Circle: class { setMap() {} },
  };
  const [geo, vehicle, camera, trip] = await loadFrontend([
    '../src/utils/geo.js', '../src/utils/vehicleMarker.js', '../src/utils/liveMapCamera.js', '../src/utils/tripTelemetry.js',
  ].map((path) => new URL(path, import.meta.url).href));
  const scope = { React: react, ...react, ...geo, ...vehicle, ...camera, ...trip,
    createPortal: (child) => child, GOOGLE_MAPS_MAP_ID: vector ? 'test-map' : null, DARK_MAP_STYLE: [],
    loadGoogleMaps: async () => mapsApi, useTheme: () => ({ effectiveTheme: 'light' }),
    useOrderTrackingSocket: () => ({ livePosition: position }), useOrderConnectionStatus: () => connection,
    useMapCoordinates: () => profiles ? { farmer: { lat: 10.3, lng: 123.9 }, buyer: { lat: 10.4, lng: 123.95 } } : {},
    useTrafficNavigation: (inputs) => { navigationInputs = inputs; return navigation; }, getLiveTransitProgress: () => ({ isInTransit: true }),
    isFreshLivePosition: () => true, nearestIndexOnPath: () => 0,
    MAP_COLORS: { origin: 'green', destination: 'blue' }, deliveryVanIcon: 'van',
    document: { createElement: () => ({ className: '', querySelector: () => ({ style: {}, removeAttribute() {} }) }) },
    performance: { now: () => 0 }, requestAnimationFrame: (callback) => { callback(1000); return null; }, cancelAnimationFrame() {},
  };
  for (const name of ['CheckCircle2', 'Clock3', 'Crosshair', 'Gauge', 'MapPin', 'Truck', 'TrafficRouteNotice', 'DriverConnectionBadge', 'LiveDeliverySummary']) scope[name] = name;
  const source = (await readFile(new URL('../src/components/orders/LiveDeliveryMap.jsx', import.meta.url), 'utf8'))
    .replace(/import[\s\S]*?from\s+['"][^'"]+['"];?/g, '').replace('export default ', '');
  const result = await transformWithOxc(source, 'LiveDeliveryMap.jsx', { jsx: { runtime: 'classic' } });
  const component = new Function('scope', `with(scope){${result.code};return LiveDeliveryMap;}`)(scope);
  const order = { id: 'canonical-order', farmerId: 'farmer', buyerId: 'buyer', deliveryMethod: 'farmer_delivery', status: 'confirmed' };
  const render = () => {
    let renders = 0;
    do {
      assert.ok(++renders < 15, 'map must not create an effect/camera render loop');
      dirty = false; index = 0; pending = [];
      tree = component({ order });
      pending.forEach((effect) => effect());
    } while (dirty);
  };
  const find = (node) => {
    if (!node || typeof node !== 'object') return null;
    if (node.props?.className?.startsWith('nav-recenter-btn')) return node;
    return node.props?.children?.flat(Infinity).map(find).find(Boolean);
  };
  render();
  await new Promise(setImmediate);
  render();
  return { maps, markers, routes, calls, render, recenter: () => { find(tree).props.onClick(); render(); },
    recenterProps: () => find(tree).props,
    navigationInputs: () => navigationInputs,
    offline() { connection = 'offline'; render(); },
    update(next) { position = next; render(); },
    cleanup() { slots.forEach((slot) => slot?.cleanup?.()); },
  };
}

for (const vector of [false, true]) {
  test(`live map keeps one ${vector ? 'vector' : 'raster'} instance and driver marker across clicks, GPS, drag and cleanup`, async () => {
    const h = await harness(vector);
    for (let i = 0; i < 10; i++) h.recenter();
    const routeCount = h.routes.length;
    h.update({ lat: 10.32, lng: 123.92, heading: 2, speed: 2 });
    assert.equal(h.maps.length, 1);
    assert.equal(h.markers.length, 3);
    assert.equal(h.routes.length, routeCount, 'GPS and recenter must not recreate route layers');
    assert.equal(h.calls.filter(([kind]) => kind === 'fit').length, 1);
    const vehicle = h.markers.find((marker) => marker.zIndex === 1000);
    assert.equal(vehicle.position.lat, 10.32);
    h.maps[0].listeners.get('dragstart')();
    h.render();
    const calls = h.calls.length;
    h.update({ lat: 10.33, lng: 123.93, heading: 10, speed: 2 });
    assert.equal(h.calls.length, calls, 'manual drag must not snap back on the next GPS update');
    h.recenter();
    assert.equal(h.calls.findLast(([kind]) => kind === 'pan')[1].lat, 10.33);
    h.cleanup();
    assert.equal(vehicle.map, null);
    assert.equal(h.maps[0].listeners.size, 0);
    h.recenter();
    assert.equal(h.calls.findLast(([kind]) => kind === 'pan')[1].lat, 10.33);
  });
}

test('buyer can see and recenter on saved live driver GPS before profile coordinates or routes arrive', async () => {
  const h = await harness(false, false);
  assert.equal(h.maps.length, 1);
  assert.equal(h.markers.length, 1);
  h.recenter();
  assert.equal(h.calls.at(-1)[1].lat, 10.31);
  h.cleanup();
});

test('recenter indicates unavailable GPS and becomes usable when the driver location arrives', async () => {
  const h = await harness(false, false, null);
  assert.equal(h.recenterProps().disabled, true);
  assert.match(h.recenterProps()['aria-label'], /Loading map|Waiting for driver location/);
  h.update({ lat: 10.32, lng: 123.92, heading: 90, speed: 2 });
  await new Promise(setImmediate);
  h.render();
  assert.equal(h.recenterProps().disabled, false);
  h.maps[0].listeners.get('dragstart')();
  h.render();
  assert.equal(h.recenterProps()['aria-pressed'], false);
  h.recenter();
  assert.equal(h.recenterProps()['aria-pressed'], true);
  assert.equal(h.calls.findLast(([kind]) => kind === 'pan')[1].lat, 10.32);
  h.cleanup();
});

test('farm fallback switches to GPS once and stopped/offline tracking never resets to the farm', async () => {
  const h = await harness(false, true, null);
  const vehicle = h.markers.find(marker => marker.zIndex === 1000);
  assert.equal(vehicle.position.lat, 10.3);
  const stopped = { lat: 10.32, lng: 123.92, heading: 90, speed: 0 };
  h.update(stopped);
  assert.equal(vehicle.position.lat, stopped.lat);
  assert.equal(vehicle.position.lng, stopped.lng);
  assert.equal(h.navigationInputs().position, stopped, 'route and marker consume the same fix');
  assert.equal(h.navigationInputs().destination.lat, 10.4, 'saved receiver destination stays fixed');
  assert.equal(h.navigationInputs().destination.lng, 123.95);
  h.offline();
  for (let i = 0; i < 5; i++) h.render();
  assert.equal(vehicle.position.lat, stopped.lat);
  assert.equal(vehicle.position.lng, stopped.lng);
  h.recenter();
  const cameraPosition = h.calls.findLast(([kind]) => kind === 'pan')[1];
  assert.equal(cameraPosition.lat, stopped.lat);
  assert.equal(cameraPosition.lng, stopped.lng);
  assert.equal(h.markers.filter(marker => marker.zIndex === 1000).length, 1);
  assert.equal(h.routes.length, 3, 'marker can update while Google route data is unavailable');
  h.cleanup();
});
