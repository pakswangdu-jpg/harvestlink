import { describe, expect, it } from 'vitest';
import { getListingContextMessageIds } from '../../../src/utils/messageListingContext.js';

describe('Unified messaging', () => {
  it('returns listing context message IDs', () => {
    const result = getListingContextMessageIds([
      { id: 'm1', productContext: { productId: 'p1' } },
      { id: 'm2', productContext: null },
    ]);
    expect(result instanceof Set).toBe(true);
    expect(result.has('m1')).toBe(true);
  });
  it('handles an empty message list', () => {
    expect([...getListingContextMessageIds([])]).toEqual([]);
  });
});
