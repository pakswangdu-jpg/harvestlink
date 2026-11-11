import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildOverlappingPopupMarkup,
  applyMarkerStackLayout,
  bindOverlappingMarkerSelection,
  getOverlappingMarkerEntries,
  getMarkerStackLayouts,
  getRoleMarkerKey,
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

test('duplicate Stakeholder pin leads the stack and shorter second pin is vertically centered', () => {
  const entries = [
    {
      key: 'farmer:f1',
      role: 'farmer',
      position: { lat: 10, lng: 123 },
      icon: { scaledSize: { width: 40, height: 51 }, anchor: { x: 20, y: 50 } },
      marker: { setIcon(icon) { this.icon = icon; } },
    },
    {
      key: 'stakeholder:s1',
      role: 'stakeholder',
      position: { lat: 10, lng: 123 },
      icon: { scaledSize: { width: 48, height: 62 }, anchor: { x: 24, y: 61 } },
      marker: { setIcon(icon) { this.icon = icon; } },
    },
  ];

  const layouts = getMarkerStackLayouts(entries, 14);
  assert.ok(layouts.get('stakeholder:s1').x < 0);
  assert.ok(layouts.get('farmer:f1').x > 0);
  assert.equal(layouts.get('farmer:f1').y, 5.5);

  applyMarkerStackLayout(entries, 14, { Point: class { constructor(x, y) { this.x = x; this.y = y; } } });
  assert.equal(entries[0].marker.icon.anchor.y, 44.5);
  assert.equal(entries[1].marker.icon.anchor.y, 61);
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
