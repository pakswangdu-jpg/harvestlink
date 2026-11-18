import { describe, expect, it } from 'vitest';
import {
  isValidEmail, required, toPositiveNumber, isValidZipCode,
  normalizeGcashReference, isValidGcashReference, isValidPersonName,
  filterGcashReferenceInput, filterPersonNameInput, validatePasswordForm,
  validateProductForm, validateCheckoutForm, validateProfileForm,
} from '../../../src/utils/validators.js';
import { getConnectionErrorMessage } from '../../../src/utils/networkError.js';

describe('Core frontend validation utilities', () => {
  it('validates required values and positive numbers', () => {
    expect(required('  value  ')).toBe(true);
    expect(required('   ')).toBe(false);
    expect(toPositiveNumber('12.5')).toBe(12.5);
    expect(toPositiveNumber('0')).toBeNull();
  });
  it('validates email and Philippine zip codes', () => {
    expect(isValidEmail('farmer@gmail.com')).toBe(true);
    expect(isValidEmail('farmer@')).toBe(false);
    expect(isValidZipCode('6000')).toBe(true);
    expect(isValidZipCode('600')).toBe(false);
  });
  it('validates GCash references and normalizes input', () => {
    expect(normalizeGcashReference('1234-5678-9012')).toBe('123456789012');
    expect(isValidGcashReference('1234 5678 9012')).toBe(true);
    expect(isValidGcashReference('123')).toBe(false);
  });
  it('validates and filters person names', () => {
    expect(isValidPersonName('Juan Dela Cruz')).toBe(true);
    expect(isValidPersonName('A')).toBe(false);
    expect(filterPersonNameInput('Juan123 Cruz!')).toBe('Juan Cruz');
  });
  it('validates passwords and checkout boundaries', () => {
    expect(validatePasswordForm({ currentPassword: 'old', newPassword: 'new', confirmPassword: 'different' }).confirmPassword)
      .toBe('Passwords do not match.');
    const checkoutErrors = validateCheckoutForm({
      quantity: '11', paymentMethod: 'cod', deliveryMethod: 'buyer_pickup',
    }, { quantity: 10, unit: 'kg', farmerId: 'farmer-1' }, { id: 'buyer-1' });
    expect(checkoutErrors.quantity).toContain('Only');
  });
  it('validates product names and profile fields', () => {
    expect(validateProductForm({
      name: '', category: '', unit: '', price: '', quantity: '',
    }, null).name).toBeTruthy();
    expect(validateProfileForm({ name: '', municipality: '', address: '', zipCode: '' }, 'buyer').name)
      .toBeTruthy();
  });
  it('filters GCash input to digits and spaces', () => {
    expect(filterGcashReferenceInput('12ab 34')).toBe('12 34');
  });
  it('shows the connection message for unreachable servers', () => {
    expect(getConnectionErrorMessage({ code: 'API_UNREACHABLE' }))
      .toBe('Please check your connection and try again.');
  });
});
