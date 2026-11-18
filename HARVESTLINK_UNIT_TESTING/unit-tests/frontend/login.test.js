import { describe, expect, it } from 'vitest';
import { isValidEmail } from '../../../src/utils/validators.js';

describe('Login validation', () => {
  it('accepts a valid normalized email', () => {
    expect(isValidEmail('Farmer@Example.com')).toBe(true);
  });
  it('rejects malformed emails', () => {
    expect(isValidEmail('farmer')).toBe(false);
    expect(isValidEmail('farmer@')).toBe(false);
  });
});
