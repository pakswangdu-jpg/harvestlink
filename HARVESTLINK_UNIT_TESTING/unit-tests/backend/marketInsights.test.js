import { describe, expect, it } from 'vitest';
import { MARKET_COMMODITIES, matchCommodity } from '../../../backend/src/lib/marketCommodities.js';

describe('Market Insights commodity matching', () => {
  it('matches a built-in commodity case-insensitively', () => {
    expect(matchCommodity('FRESH CABBAGE')?.label).toBe('Cabbage');
  });
  it('returns no commodity for unrelated text', () => {
    expect(matchCommodity('Service subscription')).toBeNull();
  });
  it('contains the built-in commodity catalog', () => {
    expect(MARKET_COMMODITIES.length).toBeGreaterThan(0);
  });
});
