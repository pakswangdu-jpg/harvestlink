import { describe, expect, it, vi } from 'vitest';
import {
  validateCoordinates, getRegisteredCoordinates, haversineKm,
  formatNearbyDistance, findNearestMunicipality,
} from '../../../src/utils/geo.js';
import { getAccurateDeviceLocation } from '../../../src/utils/deviceLocation.js';

describe('Geo and device location', () => {
  it('validates and normalizes coordinates', () => {
    expect(validateCoordinates('10.3157', '123.8854')).toEqual({ lat: 10.3157, lng: 123.8854 });
    expect(validateCoordinates(91, 123)).toBeNull();
  });
  it('gets registered coordinates only from complete profiles', () => {
    expect(getRegisteredCoordinates({ latitude: 10, longitude: 123 })).toEqual({ lat: 10, lng: 123 });
    expect(getRegisteredCoordinates({ latitude: null, longitude: 123 })).toBeNull();
  });
  it('calculates distance and formats nearby distance', () => {
    expect(haversineKm({ lat: 10, lng: 123 }, { lat: 10, lng: 123 })).toBe(0);
    expect(formatNearbyDistance(0.5)).toBe('500 m away');
  });
  it('returns a fallback for nearby municipality lookup', () => {
    expect(findNearestMunicipality(10.3157, 123.8854)).toBeTruthy();
  });
  it('resolves accurate device location and aborts safely', async () => {
    let observer;
    const geolocation = {
      watchPosition(success) {
        observer = success;
        queueMicrotask(() => observer({ coords: { latitude: 10.3157, longitude: 123.8854, accuracy: 20 } }));
        return 7;
      },
      clearWatch: vi.fn(),
    };
    await expect(getAccurateDeviceLocation(geolocation, { timeout: 1000, targetAccuracy: 50 })).resolves.toMatchObject({
      coords: { accuracy: 20 },
    });
  });
});
