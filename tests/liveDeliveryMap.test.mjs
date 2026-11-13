import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { transformWithOxc } from 'vite';
import { loadFrontend } from './helpers/loadFrontend.mjs';

async function harness(vector = false, profiles = true, initialPosition = { lat: 10.31, lng: 123.91, heading: 358, speed: 2 }, initialMapVisible = true, mapOptions = {}, orderOverrides = {}, selectedRoute = null) {
  const slots = [];
  let index = 0;
  let pending = [];
  let dirty = false;
  let tree;
  let position = initialPosition;
  let connection = 'online';
  let mapVisible = initialMapVisible;
  let mapZoom = 12;
  let navigationInputs;
  const maps = [];
  const markers = [];
  const routes = [];
  const trafficLayers = [];
  const calls = [];
  const vehicleBodies = [];
  const boundsPoints = [];
  const container = { getBoundingClientRect: () => ({ width: mapVisible ? 600 : 0, height: mapVisible ? 400 : 0 }) };
  const navigation = { selected: selectedRoute, alternatives: [], stale: !selectedRoute };
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
    constructor(_container, options) { this.options = options; this.listeners = new Map(); maps.push(this); }
    addListener(event, handler) { this.listeners.set(event, handler); return { remove: () => this.listeners.delete(event) }; }
    panTo(center) { calls.push(['pan', center]); }
    fitBounds() { calls.push(['fit']); this.listeners.get('zoom_changed')?.(); }
    getZoom() { return mapZoom; }
    setZoom(zoom) { mapZoom = zoom; calls.push(['zoom', zoom]); this.listeners.get('zoom_changed')?.(); }
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
  class TrafficLayer {
    constructor() { trafficLayers.push(this); }
    setMap(map) { this.map = map; calls.push(['traffic', map]); }
  }
  class Polyline {
    constructor(options) { Object.assign(this, options); routes.push(this); }
    setMap(map) { this.map = map; }
  }
  const mapsApi = { Map: MockMap, Marker, AdvancedMarkerElement: Marker,
    TrafficLayer, ControlPosition: { RIGHT_TOP: 1, LEFT_TOP: 2 },
    RenderingType: { VECTOR: 'VECTOR' }, Size: class {}, Point: class {},
    event: { trigger: (_map, event) => calls.push([event]) },
    LatLngBounds: class { extend(point) { boundsPoints.push(point); } },
    Polyline, Circle: class { setMap() {} },
  };
  const [geo, vehicle, camera, trip] = await loadFrontend([
    '../src/utils/geo.js', '../src/utils/vehicleMarker.js', '../src/utils/liveMapCamera.js', '../src/utils/tripTelemetry.js',
  ].map((path) => new URL(path, import.meta.url).href));
  const scope = { React: react, ...react, ...geo, ...vehicle, ...camera, ...trip,
    GOOGLE_MAPS_MAP_ID: vector ? 'test-map' : null, DARK_MAP_STYLE: [],
    loadGoogleMaps: async () => mapsApi, useTheme: () => ({ effectiveTheme: 'light' }),
    useOrderTrackingSocket: () => ({ livePosition: position }), useOrderConnectionStatus: () => connection,
    useMapCoordinates: () => profiles ? { farmer: { lat: 10.3, lng: 123.9 }, buyer: { lat: 10.4, lng: 123.95 } } : {},
    useTrafficNavigation: (inputs) => { navigationInputs = inputs; return navigation; }, getLiveTransitProgress: () => ({ isInTransit: true }),
    isFreshLivePosition: () => true, nearestIndexOnPath: () => 0,
    MAP_COLORS: { origin: 'green', destination: 'blue' }, deliveryVanIcon: 'van',
    document: { createElement: () => {
      const vehicleBody = { style: {}, removeAttribute() {} };
      vehicleBodies.push(vehicleBody);
      return { className: '', querySelector: () => vehicleBody };
    } },
    performance: { now: () => 0 }, requestAnimationFrame: (callback) => { callback(1000); return null; }, cancelAnimationFrame() {},
  };
  for (const name of ['CheckCircle2', 'Clock3', 'Crosshair', 'Gauge', 'MapPin', 'Minus', 'Plus', 'Truck', 'TrafficRouteNotice', 'DriverConnectionBadge', 'LiveDeliverySummary']) scope[name] = name;
  const source = (await readFile(new URL('../src/components/orders/LiveDeliveryMap.jsx', import.meta.url), 'utf8'))
    .replace(/import[\s\S]*?from\s+['"][^'"]+['"];?/g, '').replace('export default ', '');
  const result = await transformWithOxc(source, 'LiveDeliveryMap.jsx', { jsx: { runtime: 'classic' } });
  const component = new Function('scope', `with(scope){${result.code};return LiveDeliveryMap;}`)(scope);
  const order = { id: 'canonical-order', farmerId: 'farmer', buyerId: 'buyer', deliveryMethod: 'farmer_delivery', status: 'confirmed', ...orderOverrides };
  const render = () => {
    let renders = 0;
    do {
      assert.ok(++renders < 15, 'map must not create an effect/camera render loop');
      dirty = false; index = 0; pending = [];
      tree = component({ order, navigationEnabled: mapVisible, ...mapOptions });
      pending.forEach((effect) => effect());
    } while (dirty);
  };
  const find = (node) => {
    if (!node || typeof node !== 'object') return null;
    if (node.props?.className?.startsWith('nav-recenter-btn')) return node;
    return node.props?.children?.flat(Infinity).map(find).find(Boolean);
  };
  const findAll = (node, predicate, result = []) => {
    if (!node || typeof node !== 'object') return result;
    if (predicate(node)) result.push(node);
    node.props?.children?.flat(Infinity).forEach((child) => findAll(child, predicate, result));
    return result;
  };
  render();
  await new Promise(setImmediate);
  render();
  return { maps, markers, routes, boundsPoints, calls, render, recenter: () => { find(tree).props.onClick(); render(); },
    recenterProps: () => find(tree).props,
    zoomControls: () => findAll(tree, (node) => ['Zoom in', 'Zoom out'].includes(node.props?.['aria-label'])),
    trafficButton: () => findAll(tree, (node) => node.props?.className?.startsWith('nav-traffic-toggle'))[0],
    routeNotice: () => findAll(tree, (node) => node.type === 'TrafficRouteNotice')[0],
    vehicleBodies,
    trafficLayers,
    navigationInputs: () => navigationInputs,
    showMap() { mapVisible = true; render(); },
    offline() { connection = 'offline'; render(); },
    update(next) { position = next; render(); },
    cleanup() { slots.forEach((slot) => slot?.cleanup?.()); },
  };
}

test('buyer pickup navigation starts at fresh buyer GPS and routes to the farmer', async () => {
  const livePosition = { lat: 10.315, lng: 123.91, heading: 90, speed: 2 };
  const h = await harness(false, true, livePosition, true, {}, { deliveryMethod: 'buyer_pickup' });

  assert.deepEqual(h.navigationInputs().origin, livePosition);
  assert.deepEqual(h.navigationInputs().position, livePosition);
  assert.deepEqual(h.navigationInputs().destination, { lat: 10.3, lng: 123.9 });
  h.update(null);
  assert.equal(h.navigationInputs().origin, null, 'an active pickup does not route from the saved buyer address when GPS is unavailable');
  h.cleanup();
});

test('stakeholder pickup waits for live GPS rather than routing from a profile fallback', async () => {
  const h = await harness(false, true, null, true, {
    moverMarkerType: 'pin',
    requireLivePosition: true,
    sharerLabelOverride: 'Stakeholder',
  }, { deliveryMethod: 'buyer_pickup' });

  assert.equal(h.navigationInputs().origin, null);
  assert.equal(h.navigationInputs().position, null);
  assert.deepEqual(h.navigationInputs().destination, { lat: 10.3, lng: 123.9 });
  assert.equal(h.routeNotice().props.navigation.message, 'Waiting for fresh pickup GPS to calculate the route.');
  h.update({ lat: 10.315, lng: 123.91, heading: 90, speed: 2 });
  assert.deepEqual(h.navigationInputs().origin, { lat: 10.315, lng: 123.91, heading: 90, speed: 2 });
  h.cleanup();
});

test('stakeholder pickup draws the Google road route and fits the full route bounds', async () => {
  const path = [{ lat: 10.315, lng: 123.91 }, { lat: 10.31, lng: 123.9 }, { lat: 10.3, lng: 123.9 }];
  const h = await harness(false, true, { lat: 10.315, lng: 123.91 }, true, {
    moverMarkerType: 'pin',
    requireLivePosition: true,
    sharerLabelOverride: 'Stakeholder',
  }, {
    deliveryMethod: 'buyer_pickup',
    farmerName: 'Farm',
    buyerName: 'Stakeholder',
  }, { points: path, distanceKm: 2, durationMinutes: 8 });

  assert.ok(h.routes.some((route) => route.strokeColor === '#1a73e8' && route.path === path));
  assert.ok(path.every((point) => h.boundsPoints.includes(point)), 'the map fit includes the full road route');
  assert.equal(h.markers.find((marker) => marker.title === 'Farm').position.lat, 10.3);
  h.cleanup();
});

test('pickup does not draw a route when the farm has no registered GPS coordinates', async () => {
  const h = await harness(false, false, null, true, {
    moverMarkerType: 'pin',
    requireLivePosition: true,
  }, { deliveryMethod: 'buyer_pickup' });

  assert.equal(h.navigationInputs().destination, undefined);
  assert.equal(h.routeNotice().props.navigation.message, 'Registered farm GPS coordinates are required to calculate the pickup route.');
  h.cleanup();
});

for (const vector of [false, true]) {
  test(`vehicle icon follows live GPS heading on ${vector ? 'vector' : 'raster'} maps`, async () => {
    const h = await harness(vector, true, { lat: 10.31, lng: 123.91, heading: 270, speed: 2 });
    const vehicle = () => h.markers.find((marker) => marker.zIndex === 1000);
    const heading = () => (vector
      ? h.vehicleBodies[0].style.transform
      : decodeURIComponent(vehicle().icon.url).match(/(?:transform="rotate\(|to=")(-?\d+)/)?.[1]);

    assert.equal(heading(), vector ? 'rotate(270deg)' : '270', 'the first GPS heading is applied immediately');
    h.update({ lat: 10.31001, lng: 123.91, heading: 90, speed: 2 });
    assert.equal(heading(), vector ? 'rotate(90deg)' : '90', 'heading updates while moving before the 8 m fallback threshold');
    h.cleanup();
  });
}

test('map resizes when tracking opens and exposes working zoom controls', async () => {
  const h = await harness(false, true, { lat: 10.31, lng: 123.91, heading: 358, speed: 2 }, false);
  assert.equal(h.maps[0].options.zoomControl, false);
  assert.equal(h.calls.some(([kind]) => kind === 'resize'), false);
  h.showMap();
  assert.equal(h.calls.some(([kind]) => kind === 'resize'), true);
  assert.equal(h.calls.findLast(([kind]) => kind === 'pan')[1].lat, 10.31, 'opening tracking recenters on the current live driver location');
  assert.equal(h.recenterProps()['aria-pressed'], true);
  const [zoomIn, zoomOut] = h.zoomControls();
  assert.equal(zoomIn.props.disabled, false);
  zoomIn.props.onClick({ stopPropagation() {} });
  assert.equal(h.calls.filter(([kind]) => kind === 'zoom').at(-1)[1], 13);
  zoomOut.props.onClick({ stopPropagation() {} });
  assert.equal(h.calls.filter(([kind]) => kind === 'zoom').at(-1)[1], 12);
  h.cleanup();
});

test('map zoom controls stop at supported zoom limits', async () => {
  const h = await harness();
  const [zoomIn, zoomOut] = h.zoomControls();
  for (let i = 0; i < 12; i++) zoomIn.props.onClick({ stopPropagation() {} });
  assert.equal(h.calls.filter(([kind]) => kind === 'zoom').at(-1)[1], 21);
  for (let i = 0; i < 20; i++) zoomOut.props.onClick({ stopPropagation() {} });
  assert.equal(h.calls.filter(([kind]) => kind === 'zoom').at(-1)[1], 3);
  h.cleanup();
});

test('traffic control is placed on the left, away from right-side zoom controls', async () => {
  const source = await readFile(new URL('../src/components/orders/LiveDeliveryMap.jsx', import.meta.url), 'utf8');
  const styles = await readFile(new URL('../src/styles/globals.css', import.meta.url), 'utf8');
  assert.match(source, /className=\{`nav-traffic-toggle\$\{trafficEnabled \? ' active' : ''\}`\}/);
  assert.match(styles, /\.nav-traffic-toggle\s*\{\s*position:\s*absolute;\s*top:\s*12px;\s*left:\s*12px;\s*z-index:\s*20;/);
  assert.match(styles, /\.nav-map-zoom-controls\s*\{[^}]*right:\s*12px;/);
});

test('Traffic button is visible and toggles the map traffic layer', async () => {
  const h = await harness();
  const button = h.trafficButton();
  assert.ok(button, 'Traffic button is rendered inside the map controls');
  assert.equal(button.props['aria-pressed'], true);
  button.props.onClick();
  h.render();
  assert.equal(h.trafficButton().props['aria-pressed'], false);
  assert.equal(h.trafficLayers[0].map, null);
  h.cleanup();
});

for (const vector of [false, true]) {
  test(`live map keeps one ${vector ? 'vector' : 'raster'} instance and driver marker across clicks, GPS, drag and cleanup`, async () => {
    const h = await harness(vector);
    for (let i = 0; i < 10; i++) h.recenter();
    const routeCount = h.routes.length;
    h.update({ lat: 10.32, lng: 123.92, heading: 2, speed: 2 });
    assert.equal(h.maps.length, 1);
    assert.equal(h.markers.length, 3);
    assert.equal(h.routes.length, routeCount, 'GPS and recenter must not recreate route layers');
    assert.equal(h.calls.filter(([kind]) => kind === 'fit').length, 0, 'opening live tracking keeps the current driver centered');
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

test('vehicle marker falls back to saved travel origin without changing GPS navigation', async () => {
  const h = await harness(false, true, null);
  const savedOriginVehicle = h.markers.find(marker => marker.zIndex === 1000);
  assert.ok(savedOriginVehicle, 'the car remains visible at the saved travel origin before GPS arrives');
  assert.equal(savedOriginVehicle.position.lat, 10.3);
  assert.equal(savedOriginVehicle.position.lng, 123.9);
  assert.equal(h.navigationInputs().position, null, 'the saved origin is not sent to navigation as a GPS position');
  assert.equal(h.recenterProps().disabled, true, 'recenter waits for a live driver location');
  const stopped = { lat: 10.32, lng: 123.92, heading: 90, speed: 0 };
  h.update(stopped);
  const vehicle = h.markers.find(marker => marker.zIndex === 1000);
  assert.ok(vehicle, 'the moving vehicle appears when GPS arrives');
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

test('Stakeholder pickup uses a live-location pin and does not show saved profile coordinates as current GPS', async () => {
  const h = await harness(false, true, null, true, {
    moverMarkerType: 'pin',
    requireLivePosition: true,
    sharerLabelOverride: 'Stakeholder',
  });
  assert.equal(h.markers.some((marker) => marker.zIndex === 1000), false, 'no current-location marker is shown before a GPS fix');
  assert.equal(h.routes.length, 0, 'Stakeholder map does not draw a vehicle route');
  assert.equal(h.trafficButton(), undefined, 'Stakeholder map does not show traffic controls');
  assert.match(h.recenterProps()['aria-label'], /Waiting for stakeholder location/);

  h.update({ lat: 10.32, lng: 123.92, heading: 90, speed: 2 });
  const stakeholderPin = h.markers.find((marker) => marker.zIndex === 1000);
  assert.ok(stakeholderPin, 'a location marker appears after the live GPS fix arrives');
  assert.equal(stakeholderPin.position.lat, 10.32);
  assert.equal(stakeholderPin.position.lng, 123.92);
  assert.match(decodeURIComponent(stakeholderPin.icon.url), /<circle cx="12" cy="11"/, 'Stakeholder is represented by a pin, not a vehicle');
  assert.equal(stakeholderPin.title, 'Stakeholder live location');
  assert.equal(h.routes.length, 0, 'the live pin is shown without a route line');
  h.cleanup();
});
