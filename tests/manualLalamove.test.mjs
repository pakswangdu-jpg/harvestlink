import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import postcss from 'postcss';
import { isOfficialLalamoveTrackingUrl, lalamoveDeliveryLabel } from '../backend/shared/lalamove.js';

test('official Lalamove share links are parsed, not reconstructed, and unrelated or unsafe URLs are rejected', () => {
  for (const url of ['https://share.lalamove.com/?token=ABC%2F123', 'https://track.lalamove.com/path', 'https://share.lalamove.com:443/?token=abc']) assert.equal(isOfficialLalamoveTrackingUrl(url), true, url);
  for (const url of [null, {}, [], '', 'http://share.lalamove.com/', 'https:share.lalamove.com', 'https:////share.lalamove.com', '//share.lalamove.com', 'javascript:alert(1)', 'https://lalamove.com.evil.test/', 'https://lalamove.com@evil.test/', 'https://user:pass@share.lalamove.com/', 'https://evil.test/?lalamove.com', 'https://share.lalamove.com:999/', 'https://share.lalamove.com/has space', 'https://share.lalamove.com\\@evil.test/']) assert.equal(isOfficialLalamoveTrackingUrl(url), false, String(url));
});
test('booking, awaiting handover and actual transit remain distinct from the general order state', () => {
  const order = { status: 'confirmed', deliveryStatus: 'packed' };
  assert.equal(lalamoveDeliveryLabel(order, null), 'Not booked');
  assert.equal(lalamoveDeliveryLabel(order, { deliveryStatus: 'booked' }), 'Courier booked');
  assert.equal(lalamoveDeliveryLabel(order, { deliveryStatus: 'waiting_for_pickup' }), 'Awaiting handover');
  assert.equal(lalamoveDeliveryLabel({ ...order, deliveryStatus: 'out_for_delivery' }, { deliveryStatus: 'booked' }), 'Out for delivery');
  assert.equal(lalamoveDeliveryLabel({ ...order, status: 'completed', deliveryStatus: 'delivered' }, { deliveryStatus: 'booked' }), 'Delivered');
});
test('couriers cannot open HarvestLink live map or auto-open live tracking; other methods retain their overlay', async () => {
  const source = await readFile(new URL('../src/features/orders/OrderTracking.jsx', import.meta.url), 'utf8');
  assert.match(source, /order\.deliveryMethod !== 'farmer_delivery'/);
  assert.match(source, /isTrackable && !isCourier/);
  assert.match(source, /!isCourier \? <DeliveryTrackingOverlay/);
  assert.ok(source.indexOf('<DeliveryInfoCard') < source.indexOf('<DeliveryTrackingOverlay'));
  assert.match(source, /<LiveDeliveryMap/);
  const controller = await readFile(new URL('../backend/src/controllers/orders.controller.js', import.meta.url), 'utf8');
  assert.doesNotMatch(controller, /createLalamoveDeliveryForOrder/);
  assert.match(controller, /isTransitStep && existing\.delivery_method === 'courier'/);
});

test('manual courier controls keep safe external links, a separate handover confirmation and compact responsive dialogs', async () => {
  const card = await readFile(new URL('../src/components/orders/DeliveryInfoCard.jsx', import.meta.url), 'utf8');
  const form = await readFile(new URL('../src/components/orders/LinkLalamoveDeliveryDialog.jsx', import.meta.url), 'utf8');
  const dialog = await readFile(new URL('../src/components/orders/CourierDialog.jsx', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/components/orders/LalamoveDelivery.css', import.meta.url), 'utf8');
  assert.match(card, /isFarmer && delivery && order\.status === 'confirmed'/);
  assert.match(card, /Hand order to Lalamove\?/);
  assert.match(card, /Confirm handover/);
  assert.match(card, /Tracking provided by Lalamove/);
  assert.match(card, /target="_blank" rel="noopener noreferrer"/);
  assert.match(form, /Booking number \*/);
  assert.match(form, /Official tracking link \*/);
  assert.match(dialog, /dialog\.showModal\(\)/);
  assert.match(css, /height: fit-content/);
  assert.match(css, /max-height: calc\(100dvh - 32px\)/);
  assert.match(css, /\.app-shell \.lalamove-delivery \.btn,[\s\S]*?min-height: 44px/);
  assert.match(css, /@container courier \(max-width: 640px\)/);
  assert.doesNotMatch(css, /gradient\(|animation:/);
  postcss.parse(css).walkDecls('box-shadow', (declaration) => assert.equal(declaration.value, 'none'));
});
