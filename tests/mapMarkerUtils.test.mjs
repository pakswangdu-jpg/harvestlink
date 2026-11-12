import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyMarkerStackLayout,
  buildOverlappingPopupMarkup,
  bindOverlappingMarkerSelection,
  focusSelectedProfileMarker,
  getOverlappingMarkerEntries,
  getRoleMarkerKey,
  showProfileMarkerInfo,
  syncMarkerPositions,
  uniqueProfilesById,
} from '../src/components/map/mapMarkerUtils.js';

test('marker identities are role-qualified and repeated responses keep one latest profile', () => {
  assert.notEqual(getRoleMarkerKey('farmer', 'shared-id'), getRoleMarkerKey('buyer', 'shared-id'));
  assert.deepEqual(uniqueProfilesById([
    { id: 'farmer-1', name: 'Old name' },
    { id: 'buyer-1', name: 'Buyer' },
    { id: 'farmer-1', name: 'Updated name' },
    { name: 'Missing id' },
  ]), [
    { id: 'farmer-1', name: 'Updated name' },
    { id: 'buyer-1', name: 'Buyer' },
  ]);
});

test('same-coordinate and screen-overlapping users remain separate map targets', () => {
  const entries = [
    { key: 'farmer:f1', role: 'farmer', title: 'Farm 1', position: { lat: 10, lng: 123 } },
    { key: 'buyer:b1', role: 'buyer', title: 'Buyer 1', position: { lat: 10, lng: 123 } },
    { key: 'stakeholder:s1', role: 'stakeholder', title: 'Group 1', position: { lat: 10.00001, lng: 123 } },
    { key: 'farmer:f2', role: 'farmer', title: 'Farm 2', position: { lat: 12, lng: 125 } },
  ];

  assert.deepEqual(
    getOverlappingMarkerEntries(entries, 'farmer:f1', 15).map((entry) => entry.key),
    ['buyer:b1', 'stakeholder:s1'],
  );
  assert.deepEqual(
    getOverlappingMarkerEntries(entries, 'farmer:f1', 15).some((entry) => entry.key === 'farmer:f2'),
    false,
  );
});

test('co-located pins and their icons remain fixed through zoom syncs', () => {
  const entries = ['farmer:f1', 'buyer:b1', 'stakeholder:s1'].map((key) => {
    const position = { lat: 10, lng: 123 };
    const icon = { anchor: { x: 14, y: 38 }, scaledSize: { width: 28, height: 38 } };
    let restoredIcon;
    let positionUpdates = 0;
    let iconUpdates = 0;
    const connectorLine = { setMap(map) { this.map = map; } };
    const entry = {
      key,
      position,
      icon,
      layoutAnchor: { x: 42, y: 38 },
      connectorLine,
      originalConnectorLine: connectorLine,
      marker: {
        position: { lat: 10, lng: 123.00001 },
        setPosition(nextPosition) { positionUpdates += 1; this.position = nextPosition; },
        setIcon(nextIcon) { iconUpdates += 1; restoredIcon = nextIcon; },
      },
    };
    entry.getRestoredIcon = () => restoredIcon;
    entry.getUpdateCounts = () => ({ positionUpdates, iconUpdates });
    return entry;
  });

  for (let index = 0; index < 4; index += 1) {
    syncMarkerPositions(entries);
    entries.forEach((entry) => {
      assert.deepEqual(entry.marker.position, entry.position);
      assert.equal(entry.getRestoredIcon(), entry.icon);
      assert.equal(entry.layoutAnchor, null);
      assert.equal(entry.originalConnectorLine.map, null);
      assert.equal(entry.connectorLine, null);
      assert.equal(entry.displayPosition, entry.position);
      assert.deepEqual(entry.getUpdateCounts(), { positionUpdates: 1, iconUpdates: 1 });
    });
  }
});

test('role markers keep stored coordinates and original icon anchors through zoom syncs', () => {
  const entries = [
    { key: 'farmer:f1', role: 'farmer', position: { lat: 10, lng: 123 } },
    { key: 'buyer:b1', role: 'buyer', position: { lat: 10, lng: 123 } },
    { key: 'stakeholder:s1', role: 'stakeholder', position: { lat: 10.0001, lng: 123.0001 } },
  ].map(({ key, role, position }) => {
    const icon = { anchor: { x: 14, y: 38 }, scaledSize: { width: 28, height: 38 } };
    const connectorLine = { setMap(map) { this.map = map; } };
    return {
      key,
      role,
      position,
      icon,
      layoutAnchor: { x: 42, y: 38 },
      connectorLine,
      marker: {
        position: { lat: position.lat, lng: position.lng + 0.001 },
        icon: { ...icon, anchor: { x: 42, y: 38 } },
        getPosition() { return this.position; },
        setPosition(nextPosition) { this.position = nextPosition; },
        setIcon(nextIcon) { this.icon = nextIcon; },
      },
    };
  });

  [9, 14, 20].forEach(() => {
    applyMarkerStackLayout(entries);
    entries.forEach((entry) => {
      assert.deepEqual(entry.marker.position, entry.position);
      assert.deepEqual(entry.marker.icon, entry.icon);
      assert.equal(entry.layoutAnchor, null);
      assert.equal(entry.connectorLine, null);
      assert.equal(entry.displayPosition, entry.position);
    });
  });
});

test('selecting another profile keeps the authenticated account and selection in view', () => {
  const accountPosition = { lat: 10.3237, lng: 123.9224 };
  const selectedPosition = { lat: 9.79, lng: 123.65 };
  let idleCallback;
  const mapCalls = [];
  const map = {
    panTo: (position) => mapCalls.push(['panTo', position]),
    setZoom: (zoom) => mapCalls.push(['setZoom', zoom]),
    fitBounds: (bounds, padding) => mapCalls.push(['fitBounds', bounds.points, padding]),
    getZoom: () => 15,
  };
  const mapsApi = {
    LatLngBounds: class {
      constructor() { this.points = []; }
      extend(position) { this.points.push(position); }
    },
    event: {
      addListenerOnce: (_map, eventName, callback) => {
        assert.equal(eventName, 'idle');
        idleCallback = callback;
      },
    },
  };

  focusSelectedProfileMarker(map, mapsApi, selectedPosition, accountPosition, false);
  assert.deepEqual(mapCalls, [['fitBounds', [accountPosition, selectedPosition], 40]]);
  idleCallback();
  assert.deepEqual(mapCalls[1], ['setZoom', 13]);

  mapCalls.length = 0;
  focusSelectedProfileMarker(map, mapsApi, accountPosition, accountPosition, true);
  assert.deepEqual(mapCalls, [['panTo', accountPosition], ['setZoom', 13]]);
});

test('selecting an overlapping stakeholder brings its role-colored pin above the account pin', () => {
  const makeEntry = (key, role, baseZIndex, isCurrentUser = false) => ({
    key,
    role,
    title: key,
    isCurrentUser,
    baseZIndex,
    position: { lat: 10, lng: 123 },
    popupHtml: `<div>${key}</div>`,
    marker: { setZIndex(value) { this.zIndex = value; } },
    infoWindow: {
      setContent(value) { this.content = value; },
      open() { this.isOpen = true; },
      close() { this.isOpen = false; },
    },
  });
  const farmer = makeEntry('farmer:me', 'farmer', 1000, true);
  const stakeholder = makeEntry('stakeholder:other', 'stakeholder', null);
  const entriesRef = { current: new Map([[farmer.key, farmer], [stakeholder.key, stakeholder]]) };
  const openInfoWindowRef = { current: null };
  const map = { getZoom: () => 14 };

  showProfileMarkerInfo(map, {}, stakeholder, entriesRef, openInfoWindowRef);
  assert.equal(stakeholder.marker.zIndex, 1100);
  assert.equal(farmer.marker.zIndex, 1000);
  assert.equal(stakeholder.isSelected, true);
  assert.equal(farmer.isSelected, false);
  assert.match(stakeholder.infoWindow.content, /farmer:me/);

  showProfileMarkerInfo(map, {}, farmer, entriesRef, openInfoWindowRef);
  assert.equal(farmer.marker.zIndex, 1100);
  assert.equal(stakeholder.marker.zIndex, null);
  assert.equal(farmer.isSelected, true);
  assert.equal(stakeholder.isSelected, false);
});

test('overlap choices are role-labeled, keyboard-accessible buttons with escaped names', () => {
  const popup = buildOverlappingPopupMarkup('<div class="map-popup">Profile</div>', {
    key: 'farmer:f1',
  }, [{
    key: 'stakeholder:s1',
    role: 'stakeholder',
    title: '<Food Group>',
  }]);

  assert.match(popup, /role="group"/);
  assert.match(popup, /<button type="button" data-marker-key="stakeholder:s1"/);
  assert.match(popup, /<span>Stakeholder<\/span>/);
  assert.match(popup, /&lt;Food Group&gt;/);
});

test('choosing an overlapping user triggers that user marker click', () => {
  const previousDocument = globalThis.document;
  const previousElement = globalThis.Element;
  const listeners = {};
  const targetMarker = {};
  const button = { dataset: { markerKey: 'stakeholder:s1' } };
  const list = {
    dataset: { ownerKey: 'farmer:f1' },
    addEventListener: (name, listener) => { listeners[name] = listener; },
  };
  globalThis.Element = class {
    closest() { return button; }
  };
  globalThis.document = { querySelectorAll: () => [list] };

  let clickedMarker;
  const entriesRef = { current: new Map([['stakeholder:s1', { marker: targetMarker }]]) };
  const mapsApi = { event: { trigger: (marker, eventName) => { clickedMarker = [marker, eventName]; } } };
  const infoWindow = {
    mapMarkerKey: 'farmer:f1',
    addListener: (_name, listener) => {
      listeners.domready = listener;
      return { remove() {} };
    },
  };

  try {
    bindOverlappingMarkerSelection(infoWindow, entriesRef, mapsApi);
    listeners.domready();
    listeners.click({
      target: new globalThis.Element(),
      preventDefault() {},
      stopPropagation() {},
    });
    assert.deepEqual(clickedMarker, [targetMarker, 'click']);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousElement === undefined) delete globalThis.Element;
    else globalThis.Element = previousElement;
  }
});
