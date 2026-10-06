import assert from 'node:assert/strict';
import { test } from 'node:test';
import { accumulateTripTelemetry } from '../src/lib/tripTelemetry.js';

const time = Date.parse('2026-10-06T12:00:00Z');
const previous = {
  current_lat: 10.31, current_lng: 123.91, current_speed: 10, current_accuracy: 5,
  location_updated_at: new Date(time).toISOString(), tracked_distance_km: 1, tracked_duration_seconds: 100,
};
const sample = { lat: 10.31, lng: 123.9105, speed: 20, accuracy: 5 };
const accumulate = (order = previous, next = sample, seconds = 10) =>
  accumulateTripTelemetry(order, next, new Date(time + seconds * 1000).toISOString());

test('GPS speeds produce a time-weighted distance and include observed stops', () => {
  assert.deepEqual(accumulate(), { tracked_distance_km: 1.15, tracked_duration_seconds: 110 });
  assert.deepEqual(accumulate({ ...previous, current_speed: 0 }, { ...sample, speed: 0 }),
    { tracked_distance_km: 1, tracked_duration_seconds: 110 });
});

test('first samples, duplicate/stale timestamps, outages and impossible jumps do not invent trip data', () => {
  const totals = { tracked_distance_km: 1, tracked_duration_seconds: 100 };
  for (const seconds of [0, -10, 61]) assert.deepEqual(accumulate(previous, sample, seconds), totals);
  assert.deepEqual(accumulate({ ...previous, current_lat: null }), totals);
  assert.deepEqual(accumulate(previous, { ...sample, lat: 20 }), totals);
});

test('missing device speed uses measured GPS movement while filtering accuracy noise', () => {
  const noSpeed = { ...previous, current_speed: null };
  const noisy = accumulate(noSpeed, { ...sample, lng: 123.910001, speed: null });
  assert.equal(noisy.tracked_distance_km, 1);
  assert.equal(noisy.tracked_duration_seconds, 110);
  assert.ok(accumulate(noSpeed, { ...sample, speed: null }).tracked_distance_km > 1.05);
  assert.equal(accumulate({ ...noSpeed, current_accuracy: null }, { ...sample, speed: null }).tracked_duration_seconds, 100);
});
