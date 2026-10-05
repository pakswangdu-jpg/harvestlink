import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

const context = vm.createContext({ routeCalls: [] });
const source = await readFile(new URL('../src/services/orderService.js', import.meta.url), 'utf8');
const liveTrackingSource = await readFile(new URL('../src/utils/liveTrackingPosition.js', import.meta.url), 'utf8');
const orderService = new vm.SourceTextModule(source, {
  context,
  identifier: 'src/services/orderService.js',
});

await orderService.link((specifier) => {
  const modules = {
    './apiClient': 'export const apiClient = {};',
    '../utils/constants': `
      export const DELIVERY_SEQUENCES = {
        farmer_delivery: ['pending', 'preparing', 'packed', 'out_for_delivery', 'delivered'],
        courier: ['pending', 'preparing', 'packed', 'out_for_delivery', 'delivered'],
        buyer_pickup: ['pending', 'preparing', 'ready_for_pickup', 'picked_up'],
      };
      export function getMunicipalityCoords() { return { lat: 50, lng: 50 }; }
    `,
    '../utils/geo': `
      export function validateCoordinates(lat, lng) {
        if (lat == null || lng == null || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return null;
        return Math.abs(Number(lat)) <= 90 && Math.abs(Number(lng)) <= 180 ? { lat: Number(lat), lng: Number(lng) } : null;
      }
      export function haversineKm(a, b) {
        return (Math.abs(b.lat - a.lat) + Math.abs(b.lng - a.lng)) * 1000;
      }
      export function isReliableTrackingAccuracy(accuracy) {
        return accuracy == null || (Number.isFinite(Number(accuracy)) && Number(accuracy) >= 0 && Number(accuracy) <= 100);
      }
      export function resolveRoutePoints() {
        return { origin: { lat: 50, lng: 50 }, destination: { lat: 51, lng: 51 } };
      }
    `,
    './routingService': `
      export function getCachedRoadRoute(origin, destination) {
        globalThis.routeCalls.push({ origin, destination });
        return null;
      }
    `,
    '../utils/liveTrackingPosition': liveTrackingSource,
  };
  if (specifier === './geo') specifier = '../utils/geo';
  return new vm.SourceTextModule(modules[specifier], { context, identifier: specifier });
});
await orderService.evaluate();

const { getLiveTransitProgress } = orderService.namespace;

test('tracking estimates use registered Farmer-to-Buyer coordinates', () => {
  const origin = { lat: 10.123456, lng: 123.654321 };
  const destination = { lat: 10.234567, lng: 123.765432 };
  const order = {
    id: 'order-1',
    deliveryMethod: 'farmer_delivery',
    deliveryStatus: 'packed',
    originMunicipality: 'Old origin municipality',
    deliveryMunicipality: 'Old destination municipality',
  };

  const transit = getLiveTransitProgress(order, { origin, destination });

  assert.deepEqual(JSON.parse(JSON.stringify(context.routeCalls[0])), { origin, destination });
  assert.ok(Math.abs(transit.estimatedTotalMinutes - 533.3328) < 1e-9);
});

test('active tracking keeps the received GPS position rather than the profile origin', () => {
  const origin = { lat: 10, lng: 123 };
  const destination = { lat: 11, lng: 124 };
  const liveGps = { lat: 10.4, lng: 123.6 };
  const order = {
    id: 'order-2',
    deliveryMethod: 'farmer_delivery',
    deliveryStatus: 'out_for_delivery',
    originMunicipality: 'Old origin municipality',
    deliveryMunicipality: 'Old destination municipality',
    currentLat: liveGps.lat,
    currentLng: liveGps.lng,
    locationUpdatedAt: new Date().toISOString(),
  };

  const transit = getLiveTransitProgress(order, { origin, destination });

  assert.deepEqual(
    { lat: transit.currentPosition.lat, lng: transit.currentPosition.lng },
    liveGps,
  );
});

test('active tracking does not use GPS coordinates with poor reported accuracy', () => {
  const order = {
    id: 'order-3',
    deliveryMethod: 'farmer_delivery',
    deliveryStatus: 'out_for_delivery',
    currentLat: 10.4,
    currentLng: 123.6,
    currentAccuracy: 180,
    locationUpdatedAt: new Date().toISOString(),
  };

  const transit = getLiveTransitProgress(order, {
    origin: { lat: 10, lng: 123 },
    destination: { lat: 11, lng: 124 },
  });

  assert.equal(transit.currentPosition, null);
  assert.equal(transit.isLiveGps, false);
});
