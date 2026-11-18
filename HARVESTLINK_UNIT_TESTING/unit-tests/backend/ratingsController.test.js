import { describe, expect, it } from 'vitest';
import { validateGcashForm } from '../../../src/utils/validators.js';

describe('Rating and GCash validation', () => {
  it('requires GCash account name and number', () => {
    const errors = validateGcashForm({ gcashAccountName: '', gcashNumber: '' });
    expect(errors.gcashAccountName).toBeTruthy();
    expect(errors.gcashNumber).toBeTruthy();
  });
  it('accepts complete GCash fields', () => {
    expect(validateGcashForm({ gcashAccountName: 'Juan', gcashNumber: '09171234567' })).toEqual({});
  });
});
