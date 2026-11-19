import { describe, expect, it } from 'vitest';
import {
  normalizeGcashReference,
  isValidGcashReference,
  validateGcashForm,
  validatePasswordForm,
} from '../../../src/utils/validators.js';

describe('Payment and password validation', () => {
  it('normalizes GCash references', () => {
    expect(normalizeGcashReference('12-3456-789012')).toBe('123456789012');
  });
  it('accepts 12-13 digit GCash references', () => {
    expect(isValidGcashReference('123456789012')).toBe(true);
    expect(isValidGcashReference('1234567890123')).toBe(true);
  });
  it('rejects short GCash references', () => {
    expect(isValidGcashReference('123')).toBe(false);
  });
  it('validates password confirmation', () => {
    expect(validatePasswordForm({ currentPassword: 'old', newPassword: 'one', confirmPassword: 'two' }).confirmPassword)
      .toBe('Passwords do not match.');
  });
  it('requires GCash account name and number', () => {
    const errors = validateGcashForm({ gcashAccountName: '', gcashNumber: '' });
    expect(errors.gcashAccountName).toBeTruthy();
    expect(errors.gcashNumber).toBeTruthy();
  });
});
