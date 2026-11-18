import { describe, expect, it } from 'vitest';
import { isValidEmail } from '../../../src/utils/validators.js';

describe('Contact Us validation', () => {
  it('accepts a Gmail address', () => {
    expect(isValidEmail('visitor@gmail.com')).toBe(true);
  });
  it('rejects invalid visitor email', () => {
    expect(isValidEmail('visitor')).toBe(false);
  });
});
