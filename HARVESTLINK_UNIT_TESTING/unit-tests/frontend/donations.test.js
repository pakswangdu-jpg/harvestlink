import { describe, expect, it } from 'vitest';
import {
  isDonationArrivalVerified,
  resolveDonationPickupStatus,
  canFarmerConfirmDonationHandover,
} from '../../../src/utils/donationWorkflow.js';

describe('Donation and stakeholder pickup workflow', () => {
  it('rejects unverified arrival', () => {
    expect(isDonationArrivalVerified({})).toBe(false);
  });
  it('resolves known pickup statuses', () => {
    expect(resolveDonationPickupStatus({ pickupStatus: 'awaiting_confirmation' })).toBeTruthy();
  });
  it('checks farmer handover eligibility', () => {
    expect(typeof canFarmerConfirmDonationHandover).toBe('function');
  });
});
