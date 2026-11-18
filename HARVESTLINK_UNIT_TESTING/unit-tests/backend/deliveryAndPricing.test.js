import { describe, expect, it } from 'vitest';
import { ApiError } from '../../../backend/src/lib/ApiError.js';
import { getDeliverySequence, getNextDeliveryStatus, isCancellable } from '../../../backend/src/lib/deliverySequence.js';
import { calculateFeeForDistance } from '../../../backend/src/lib/deliveryFeeConfig.js';
import { resolveKgPerUnit, assertPlausiblePricePerKg, buildPriceReview } from '../../../backend/src/lib/priceReview.js';
import { containsProhibitedListingText } from '../../../backend/src/lib/prohibitedListingText.js';

describe('Backend delivery and pricing', () => {
  it('returns status sequences and next status', () => {
    expect(getDeliverySequence('buyer_pickup')).toContain('ready_for_pickup');
    expect(getNextDeliveryStatus({ delivery_method: 'farmer_delivery', delivery_status: 'pending' })).toBe('preparing');
  });
  it('allows cancellation only for pending orders', () => {
    expect(isCancellable({ status: 'pending' })).toBe(true);
    expect(isCancellable({ status: 'preparing' })).toBe(false);
  });
  it('calculates delivery fee tiers for boundary distances', () => {
    expect(calculateFeeForDistance(0).fee).toBe(30);
  });
  it('resolves unit conversion and rejects unrealistic price-per-kilogram values', () => {
    expect(resolveKgPerUnit('kg', null)).toBe(1);
    expect(() => assertPlausiblePricePerKg('Price', 6000, 1)).toThrow();
  });
  it('creates a price review only above the threshold', () => {
    expect(buildPriceReview({ referencePrice: 40, commodityLabel: 'Cabbage' }, 50, null, 1)?.status).toBe('pending');
    expect(buildPriceReview({ referencePrice: 40, commodityLabel: 'Cabbage' }, 45, null, 1)).toBeNull();
  });
  it('detects prohibited listing terms safely', () => {
    expect(containsProhibitedListingText('Fresh CANNABIS')).toBe(true);
    expect(containsProhibitedListingText('Fresh cabbage')).toBe(false);
  });
  it('creates API errors with status and code', () => {
    const error = new ApiError('Invalid request', 400, 'INVALID_REQUEST');
    expect(error.status).toBe(400);
    expect(error.code).toBe('INVALID_REQUEST');
  });
});
