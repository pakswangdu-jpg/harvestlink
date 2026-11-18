import { describe, expect, it } from 'vitest';
import { buildPriceReview } from '../../../backend/src/lib/priceReview.js';

describe('Checkout price review', () => {
  it('does not review prices within the allowed threshold', () => {
    expect(buildPriceReview({ referencePrice: 40 }, 45, null, 1)).toBeNull();
  });
  it('creates a review above the allowed threshold', () => {
    const review = buildPriceReview({ referencePrice: 40 }, 60, null, 1);
    expect(review?.status).toBe('pending');
  });
});
