import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('order tracking loads participant coordinates through the order-authorized endpoint', async () => {
  const [trackingPage, trackingModal, orderService, routes] = await Promise.all([
    readFile(new URL('../src/features/orders/OrderTracking.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/orders/LiveTrackingModal.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/orderService.js', import.meta.url), 'utf8'),
    readFile(new URL('../backend/src/routes/orders.routes.js', import.meta.url), 'utf8'),
  ]);
  assert.match(trackingPage, /getOrderTrackingProfiles\(order\.id\)/);
  assert.match(trackingModal, /getOrderTrackingProfiles\(order\.id\)/);
  assert.match(orderService, /\/orders\/\$\{id\}\/tracking-profiles/);
  assert.match(routes, /router\.get\('\/:id\/tracking-profiles', requireAuth, getOrderTrackingProfiles\)/);
});
