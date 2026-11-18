import { describe, expect, it } from 'vitest';
import { getDeliverySequence, getNextDeliveryStatus, isCancellable } from '../../../backend/src/lib/deliverySequence.js';

describe('Order and delivery status', () => {
  it('returns a valid buyer-pickup sequence', () => {
    expect(getDeliverySequence('buyer_pickup')).toContain('ready_for_pickup');
  });
  it('rejects cancellation after preparation', () => {
    expect(isCancellable({ status: 'completed' })).toBe(false);
  });
  it('provides a next status', () => {
    expect(getNextDeliveryStatus({ delivery_method: 'farmer_delivery', delivery_status: 'pending' })).toBe('preparing');
  });
});
