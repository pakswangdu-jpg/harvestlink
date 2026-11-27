import { describe, expect, it } from 'vitest';
import {
  NEARBY_FARMERS_RADIUS_KM,
  filterNearbyByRegisteredDistance,
  haversineKm,
} from '../../../src/utils/geo';

describe('Nearby farmers 10 km Haversine filtering', () => {
  const mandaueOrigin = { lat: 10.3236, lng: 123.9223 };

  it('excludes farmers outside 10 km (e.g. Alcantara ~71 km away) and invalid/missing coordinates', () => {
    const alcantaraDistance = haversineKm(mandaueOrigin, { lat: 9.9756, lng: 123.4044 });
    expect(alcantaraDistance).toBeGreaterThan(65);

    const farmers = [
      { id: 'alcantara', name: 'Alcantara Farm', latitude: 9.9756, longitude: 123.4044 },
      { id: 'cebu', name: 'Cebu City Farm', latitude: 10.3157, longitude: 123.8854 },
      { id: 'mandaue-near', name: 'Mandaue Farm', latitude: 10.33, longitude: 123.93 },
      { id: 'missing', name: 'Missing Coords', latitude: null, longitude: null },
      { id: 'invalid', name: 'Invalid Coords', latitude: 200, longitude: 'abc' },
    ];

    const nearby = filterNearbyByRegisteredDistance(mandaueOrigin, farmers);
    expect(NEARBY_FARMERS_RADIUS_KM).toBe(10);
    expect(nearby.map((farmer) => farmer.id)).toEqual(['mandaue-near', 'cebu']);
    expect(nearby[0].distanceKm).toBeLessThan(nearby[1].distanceKm);
    expect(nearby.every((farmer) => farmer.distanceKm <= 10)).toBe(true);
  });

  it('returns empty list when no farmers are within 10 km or buyer has no saved coordinates', () => {
    const distantFarmers = [
      { id: 'alcantara', name: 'Alcantara Farm', latitude: 9.9756, longitude: 123.4044 },
    ];
    expect(filterNearbyByRegisteredDistance(mandaueOrigin, distantFarmers)).toEqual([]);
    expect(filterNearbyByRegisteredDistance(null, distantFarmers)).toEqual([]);
  });
});
