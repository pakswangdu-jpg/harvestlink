import { describe, expect, it } from 'vitest';
import { isValidPhilippineMobile } from '../../../src/utils/philippineMobile.js';

describe('Registration validation', () => {
  it('accepts valid Philippine mobile numbers', () => {
    expect(isValidPhilippineMobile('09171234567')).toBe(true);
  });
  it('rejects missing or malformed mobile numbers', () => {
    expect(isValidPhilippineMobile('')).toBe(false);
    expect(isValidPhilippineMobile('123')).toBe(false);
  });
});
