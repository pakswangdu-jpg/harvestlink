import { describe, expect, it } from 'vitest';
import { containsProhibitedListingText } from '../../../backend/src/lib/prohibitedListingText.js';
import { resolveKgPerUnit } from '../../../backend/src/lib/priceReview.js';

describe('Product management', () => {
  it('blocks prohibited listing terms case-insensitively', () => {
    expect(containsProhibitedListingText('Fresh CANNABIS')).toBe(true);
  });
  it('allows ordinary product names', () => {
    expect(containsProhibitedListingText('Fresh Cabbage')).toBe(false);
  });
  it('resolves fixed and custom unit conversions', () => {
    expect(resolveKgPerUnit('kg', null)).toBe(1);
  });
});
