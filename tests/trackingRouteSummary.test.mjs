import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';

const source = (await readFile(new URL('../src/components/orders/TrackingRouteSummary.jsx', import.meta.url), 'utf8'))
  .replace(/import[^;]+;/g, '').replace('export default ', '');
const { code } = await transformWithOxc(source, 'TrackingRouteSummary.jsx', { jsx: { runtime: 'classic' } });
const TrackingRouteSummary = new Function('React', 'Circle', 'MapPin', `${code}; return TrackingRouteSummary;`)(React, 'span', 'span');
const order = { farmerName: 'Farmer Name', buyerName: 'Receiver Name', farmerFarmName: 'Order Farm', originMunicipality: 'Mandaue City', deliveryMunicipality: 'Cebu City', deliveryMethod: 'farmer_delivery' };
const farmerProfile = { farmName: 'Doms Farm', address: 'Farm Road', municipality: 'Mandaue City' };
const buyerProfile = { address: 'Receiving Street', municipality: 'Cebu City' };
const render = (props = {}) => renderToStaticMarkup(React.createElement(TrackingRouteSummary, { order, farmerProfile, buyerProfile, ...props }));

test('delivery shows farm before receiver, with addresses from the loaded profiles', () => {
  const html = render();
  assert.ok(html.indexOf('Doms Farm') < html.indexOf('Receiver Name'));
  assert.match(html, /Farm Road, Mandaue City/);
  assert.match(html, /Receiving Street, Cebu City/);
  assert.match(html, /Starting point/);
  assert.match(html, /Destination/);
  assert.doesNotMatch(html, /<input|<button/);
});

test('pickup order locations keep the farmer first without mutating fulfillment data', () => {
  const pickupOrder = Object.freeze({ ...order, deliveryMethod: 'buyer_pickup' });
  const html = render({ order: pickupOrder });
  assert.ok(html.indexOf('Doms Farm') < html.indexOf('Receiver Name'));
  assert.match(html, /Buyer \/ receiving location/);
  assert.match(html, /Farmer \/ source location/);
  assert.equal(pickupOrder.originMunicipality, 'Mandaue City');
});

test('pickup never uses the farm pickup municipality as a missing receiver address', () => {
  const html = render({ order: { ...order, deliveryMethod: 'buyer_pickup', deliveryMunicipality: 'Farm pickup municipality' }, buyerProfile: null });
  assert.match(html, /Saved location unavailable/);
  assert.doesNotMatch(html, /Farm pickup municipality/);
});

test('stakeholder uses the same route with the receiving role identified correctly', () => {
  const html = render({ receiverRole: 'stakeholder' });
  assert.ok(html.indexOf('Doms Farm') < html.indexOf('Receiver Name'));
  assert.match(html, /Stakeholder \/ receiving location/);
  assert.doesNotMatch(html, /Buyer \/ receiving location/);
});

test('missing profiles use order locations and never invent an address', () => {
  const html = render({ farmerProfile: null, buyerProfile: null });
  assert.match(html, /Order Farm/);
  assert.match(html, /Mandaue City/);
  assert.match(html, /Cebu City/);
  const unavailable = render({ order: { ...order, originMunicipality: '', deliveryMunicipality: '' }, farmerProfile: null, buyerProfile: null });
  assert.equal(unavailable.match(/Saved location unavailable/g).length, 2);
  assert.doesNotMatch(render({ buyerProfile: { address: 'Receiving Street, Cebu City', municipality: 'Cebu City' } }), /Cebu City, Cebu City/);
});
