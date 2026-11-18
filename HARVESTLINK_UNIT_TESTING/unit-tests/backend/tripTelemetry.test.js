import { describe, expect, it } from 'vitest';
import { accumulateTripTelemetry } from '../../../backend/src/lib/tripTelemetry.js';

describe('Trip telemetry', () => {
  it('adds displacement and duration for valid speed samples', () => {
    const result = accumulateTripTelemetry({
      tracked_distance_km: 0,
      tracked_duration_seconds: 0,
      current_lat: 10,
      current_lng: 123,
      location_updated_at: '2026-11-19T10:00:00Z',
      current_speed: 5,
    }, { lat: 10.001, lng: 123.001, speed: 5 }, '2026-11-19T10:00:10Z');
    expect(result.tracked_distance_km).toBeGreaterThan(0);
    expect(result.tracked_duration_seconds).toBe(10);
  });
  it('rejects sample gaps longer than one minute', () => {
    const result = accumulateTripTelemetry({
      tracked_distance_km: 2,
      tracked_duration_seconds: 20,
      current_lat: 10,
      current_lng: 123,
      location_updated_at: '2026-11-19T10:00:00Z',
    }, { lat: 10.1, lng: 123.1 }, '2026-11-19T10:05:00Z');
    expect(result.tracked_distance_km).toBe(2);
    expect(result.tracked_duration_seconds).toBe(20);
  });
});
