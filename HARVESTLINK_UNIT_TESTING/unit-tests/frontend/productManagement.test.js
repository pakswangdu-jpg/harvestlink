import { describe, expect, it } from 'vitest';
import { getFixedKgPerUnit } from '../../../src/utils/unitConversion.js';
import { validateProductForm } from '../../../src/utils/validators.js';

describe('Product management', () => {
  it('uses fixed metric conversions', () => {
    expect(getFixedKgPerUnit('kg')).toBe(1);
    expect(getFixedKgPerUnit('g')).toBe(0.001);
  });
  it('rejects missing product fields', () => {
    const errors = validateProductForm({
      name: '', category: '', unit: '', price: '', quantity: '',
    }, null);
    expect(errors.name).toBeTruthy();
    expect(errors.category).toBeTruthy();
  });
});
