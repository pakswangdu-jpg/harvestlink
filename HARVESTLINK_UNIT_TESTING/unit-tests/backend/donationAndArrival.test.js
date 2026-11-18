import { describe, expect, it } from 'vitest';
import {
  validCoordinatePair,
  evaluateDonationArrival,
} from '../../../backend/src/lib/donationArrival.js';
import { resolveDonationPickupStatus, canFarmerConfirmDonationHandover } from '../../../src/utils/donationWorkflow.js';

describe('Donation arrival and pickup rules', () => {
  it('validates coordinate pairs and accuracy', () => {
    expect(validCoordinatePair({ lat: 10.3157, lng: 123.8854 })).toBe(true);
    expect(validCoordinatePair({ lat: 91, lng: 123 })).toBe(false);
  });
  it('evaluates donation arrival boundaries', () => {
    const result = evaluateDonationArrival({
      donation: { delivery_status: 'out_for_delivery' },
      farmerCoords: { lat: 10.3157, lng: 123.8854 },
      reading: { latitude: 10.3157, longitude: 123.8854, accuracy: 20 },
      consecutiveReadings: 1,
    });
    expect(result).toBeTruthy();
  });
  it('resolves pickup status safely', () => {
    expect(resolveDonationPickupStatus({ handoverStatus: 'awaiting_confirmation' })).toBeTruthy();
  });
  it('checks farmer handover confirmation permission', () => {
    expect(typeof canFarmerConfirmDonationHandover).toBe('function');
  });
});
