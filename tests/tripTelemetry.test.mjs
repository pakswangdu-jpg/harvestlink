import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getRecordedAverageSpeedKmh } from '../src/utils/tripTelemetry.js';

test('recorded average uses GPS distance and measurement duration, independent of route/order timestamps', () => {
  assert.equal(getRecordedAverageSpeedKmh({ trackedDistanceKm: 1.5, trackedDurationSeconds: 180,
    updatedAt: '2026-10-07', transitStartedAt: '2026-10-06' }), 30);
  assert.equal(getRecordedAverageSpeedKmh({ trackedDistanceKm: 0, trackedDurationSeconds: 30 }), 0);
});

test('historical or incomplete telemetry shows no fabricated average', () => {
  for (const order of [{}, { trackedDistanceKm: 1, trackedDurationSeconds: 0 },
    { trackedDistanceKm: null, trackedDurationSeconds: 30 }, { trackedDistanceKm: -1, trackedDurationSeconds: 30 }]) {
    assert.equal(getRecordedAverageSpeedKmh(order), null);
  }
});
