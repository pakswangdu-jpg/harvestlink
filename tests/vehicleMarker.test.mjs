import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildVehicleMarkerSvg,
  computeVehicleBearing,
  getDeviceCompassHeading,
  getContinuousVehicleHeading,
  normalizeVehicleHeading,
  resolveVehicleHeading,
  smoothVehicleHeading,
  VEHICLE_HEADING_MIN_MOVEMENT_KM,
  VEHICLE_MARKER_ANIMATION_DURATION_MS,
  VEHICLE_MARKER_HEIGHT_PX,
  VEHICLE_MARKER_WIDTH_PX,
} from '../src/utils/vehicleMarker.js';

const origin = { lat: 0, lng: 0 };

test('vehicle bearing points north, east, south, west and northeast', () => {
  assert.ok(Math.abs(computeVehicleBearing(origin, { lat: 1, lng: 0 }) - 0) < 0.1);
  assert.ok(Math.abs(computeVehicleBearing(origin, { lat: 0, lng: 1 }) - 90) < 0.1);
  assert.ok(Math.abs(computeVehicleBearing(origin, { lat: -1, lng: 0 }) - 180) < 0.1);
  assert.ok(Math.abs(computeVehicleBearing(origin, { lat: 0, lng: -1 }) - 270) < 0.1);
  assert.ok(Math.abs(computeVehicleBearing(origin, { lat: 1, lng: 1 }) - 45) < 0.2);
});

test('vehicle keeps its last heading below the 8 m movement threshold', () => {
  const result = resolveVehicleHeading({
    previousPosition: origin,
    currentPosition: { lat: 0, lng: 0.00005 },
    lastHeading: 135,
    gpsHeading: 280,
  });

  assert.equal(VEHICLE_HEADING_MIN_MOVEMENT_KM, 0.008);
  assert.equal(result.heading, 135);
  assert.equal(result.shouldUpdateReference, false);
});

test('vehicle prefers compass, falls back to GPS heading and then movement bearing', () => {
  const destination = { lat: 0, lng: 0.0001 };

  assert.deepEqual(resolveVehicleHeading({
    previousPosition: origin,
    currentPosition: destination,
    lastHeading: 0,
    deviceHeading: 274,
    gpsHeading: 92,
  }), { heading: 274, shouldUpdateReference: true });

  assert.deepEqual(resolveVehicleHeading({
    previousPosition: origin,
    currentPosition: destination,
    lastHeading: 0,
    gpsHeading: 92,
  }), { heading: 92, shouldUpdateReference: true });

  assert.deepEqual(resolveVehicleHeading({
    previousPosition: origin,
    currentPosition: destination,
    lastHeading: 135,
  }), { heading: 90, shouldUpdateReference: true });
});

test('device orientation converts absolute alpha with screen angle and prefers iOS compass heading', () => {
  assert.equal(getDeviceCompassHeading({ absolute: true, alpha: 0 }, 0), 0);
  assert.equal(getDeviceCompassHeading({ absolute: true, alpha: 270 }, 0), 90);
  assert.equal(getDeviceCompassHeading({ absolute: true, alpha: 0 }, 90), 90);
  assert.equal(getDeviceCompassHeading({ alpha: 270 }, 0, true), 90);
  assert.equal(getDeviceCompassHeading({ webkitCompassHeading: 181, alpha: 90 }, 90), 181);
  assert.equal(getDeviceCompassHeading({ absolute: false, alpha: 90 }), null);
  assert.equal(normalizeVehicleHeading(721), 1);
});

test('device heading smoothing follows the short path across north', () => {
  assert.equal(smoothVehicleHeading(359, 1), 359.5);
  assert.equal(smoothVehicleHeading(1, 359), 0.5);
  assert.equal(resolveVehicleHeading({
    previousPosition: origin,
    currentPosition: origin,
    lastHeading: 15,
    deviceHeading: 92,
  }).heading, 92);
});

test('vehicle heading changes use the shortest rotation across north', () => {
  assert.equal(getContinuousVehicleHeading(359, 1), 361);
  assert.equal(getContinuousVehicleHeading(1, 359), -1);
});

test('vehicle marker uses the cropped van image without a container', () => {
  const svg = buildVehicleMarkerSvg('data:image/png;base64,cropped-van');

  assert.equal(VEHICLE_MARKER_WIDTH_PX, 28);
  assert.equal(VEHICLE_MARKER_HEIGHT_PX, 48);
  assert.ok(VEHICLE_MARKER_ANIMATION_DURATION_MS > 0);
  assert.ok(VEHICLE_MARKER_ANIMATION_DURATION_MS <= 800);
  assert.match(svg, /viewBox="0 0 28 48"/);
  assert.doesNotMatch(svg, /<circle\b/);
  assert.match(svg, /data-vehicle-body="true" transform="rotate\(0 14 24\)"/);
  assert.match(svg, /<image href="data:image\/png;base64,cropped-van" x="2" y="2" width="24" height="44"/);
  assert.match(svg, /<feDropShadow dx="0" dy="1" stdDeviation="\.65"/);
  assert.match(buildVehicleMarkerSvg('van', 90), /transform="rotate\(90 14 24\)"/);
  assert.match(buildVehicleMarkerSvg('van', 1, 359), /<animateTransform[^>]+from="359 14 24" to="361 14 24" dur="300ms"/);
});
