import { describe, expect, it } from 'vitest';
import {
  normalizeVehicleHeading,
  getContinuousVehicleHeading,
  computeVehicleBearing,
  getDeviceCompassHeading,
  resolveVehicleHeading,
  buildVehicleMarkerSvg,
} from '../../../src/utils/vehicleMarker.js';

describe('Vehicle marker and heading', () => {
  it('normalizes headings to 0-359 degrees', () => {
    expect(normalizeVehicleHeading(360)).toBe(0);
    expect(normalizeVehicleHeading(-90)).toBe(270);
    expect(normalizeVehicleHeading(null)).toBeNull();
  });
  it('chooses the shortest heading transition', () => {
    expect(getContinuousVehicleHeading(350, 10)).toBe(370);
  });
  it('calculates north/east bearings', () => {
    const bearing = computeVehicleBearing(
      { lat: 10, lng: 123 },
      { lat: 11, lng: 123 },
    );
    expect(bearing).toBeCloseTo(0, 1);
  });
  it('handles iOS compass headings and rejects bad accuracy', () => {
    expect(getDeviceCompassHeading({ webkitCompassHeading: 90 })).toBe(90);
    expect(getDeviceCompassHeading({ webkitCompassHeading: 90, webkitCompassAccuracy: -1 })).toBeNull();
  });
  it('falls back to GPS bearing for movement', () => {
    const result = resolveVehicleHeading({
      previousPosition: { lat: 10, lng: 123 },
      currentPosition: { lat: 11, lng: 123, speed: 1 },
      gpsHeading: 45,
    });
    expect(result.heading).toBe(45);
    expect(result.shouldUpdateReference).toBe(true);
  });
  it('builds a vehicle SVG marker', () => {
    const svg = buildVehicleMarkerSvg('/vehicle.png', 90);
    expect(svg).toContain('<svg');
    expect(svg).toContain('/vehicle.png');
  });
});
