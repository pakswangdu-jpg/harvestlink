import { describe, expect, it } from 'vitest';
import {
  getProductApprovalStatus,
  getProductListingStatusInfo,
  getProductStatusInfo,
  getExpiryStatus,
} from '../../../src/utils/constants.js';

describe('Catalog and product status management', () => {
  it('maps approval review states', () => {
    expect(getProductApprovalStatus({ priceReview: { status: 'pending' } })).toBe('pending');
    expect(getProductApprovalStatus({ priceReview: { status: 'declined' } })).toBe('rejected');
  });
  it('maps stock states', () => {
    expect(getProductListingStatusInfo({ status: 'active', quantity: 0 }).value).toBe('out-of-stock');
    expect(getProductListingStatusInfo({ status: 'active', quantity: 5 }).value).toBe('low-stock');
  });
  it('handles expired and future expiration dates', () => {
    expect(getExpiryStatus(null)).toBeNull();
    expect(getExpiryStatus('2099-12-31')).toBeNull();
  });
  it('combines approval and listing states', () => {
    expect(getProductStatusInfo({ status: 'active', quantity: 10, priceReview: { status: 'pending' } }).value).toBe('pending-approval');
  });
});
