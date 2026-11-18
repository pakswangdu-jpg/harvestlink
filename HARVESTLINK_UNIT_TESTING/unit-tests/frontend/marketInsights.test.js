import { describe, expect, it } from 'vitest';
import { formatCurrency } from '../../../src/utils/formatters.js';

describe('Market Insights formatting', () => {
  it('formats Philippine peso values', () => {
    expect(formatCurrency(40)).toContain('40');
  });
  it('handles zero and null values safely', () => {
    expect(formatCurrency(0)).toContain('0');
    expect(formatCurrency(null)).toContain('0');
  });
});
