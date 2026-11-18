import { describe, expect, it } from 'vitest';
import { formatCurrency } from '../../../src/utils/formatters.js';

describe('Admin dashboard presentation', () => {
  it('formats financial values', () => {
    expect(formatCurrency(1250)).toContain('1,250');
  });
});
