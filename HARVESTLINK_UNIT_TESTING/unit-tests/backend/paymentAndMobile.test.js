import { describe, expect, it } from 'vitest';
import { normalizeGcashReference, isValidGcashReference, validateGcashForm } from '../../../src/utils/validators.js';
import { sanitizePhoneInput, isValidPhilippineMobile, toE164PhilippineMobile } from '../../../src/utils/philippineMobile.js';

describe('Payment and mobile validation', () => {
  it('normalizes GCash references and validates lengths', () => {
    expect(normalizeGcashReference('12-3456')).toBe('123456');
    expect(isValidGcashReference('123456789012')).toBe(true);
  });
  it('validates GCash form required fields', () => {
    expect(validateGcashForm({ gcashAccountName: '', gcashNumber: '' }).gcashAccountName)
      .toBe('Enter the name on your GCash account.');
  });
  it('sanitizes and converts Philippine mobile numbers', () => {
    expect(sanitizePhoneInput('+63 917 123 4567')).toBe('+639171234567');
    expect(isValidPhilippineMobile('09171234567')).toBe(true);
    expect(toE164PhilippineMobile('09171234567')).toBe('+639171234567');
  });
  it('rejects unsupported or malformed mobile numbers', () => {
    expect(isValidPhilippineMobile('123')).toBe(false);
    expect(toE164PhilippineMobile('123')).toBeNull();
  });
});
