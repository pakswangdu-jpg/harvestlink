import { describe, expect, it } from 'vitest';
import {
  validCoordinatePair, evaluateDonationArrival,
  ARRIVAL_GEOFENCE_RADIUS_METERS,
} from '../../../backend/src/lib/donationArrival.js';

describe('Donation arrival geofence', () => {
  it('validates coordinate pairs and rejects invalid latitudes', () => {
    expect(validCoordinatePair({ lat: 10.3157, lng: 123.8854, accuracy: 20 })).toBe(true);
    expect(validCoordinatePair({ lat: 91, lng: 123 })).toBe(false);
  });
  it('evaluates a close, accurate reading', () => {
    const result = evaluateDonationArrival({
      donation: { status: 'accepted' },
      farmerCoords: { lat: 10.3157, lng: 123.8854 },
      reading: { latitude: 10.3158, longitude: 123.8855, accuracy: 15 },
      consecutiveReadings: 1,
    });
    expect(result).toBeTruthy();
  });
  it('exports a reasonable geofence radius', () => {
    expect(ARRIVAL_GEOFENCE_RADIUS_METERS).toBeLessThanOrEqual(100);
  });
});
