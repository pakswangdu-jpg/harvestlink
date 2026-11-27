import { describe, expect, it } from 'vitest';
import {
  buildProductDuplicateKey,
  findDuplicateActiveProduct,
  normalizeProductName,
} from '../../../backend/shared/productDuplicate.js';

describe('Duplicate product listing validation', () => {
  const existingListings = [
    {
      id: 'prod-1',
      name: 'Red Cabbage',
      variety: 'Organic',
      grade: 'A',
      sellingType: 'retail',
      unit: 'kg',
      expirationDate: '2026-12-10',
      price: 60,
      quantity: 30,
      status: 'active',
    },
    {
      id: 'prod-2',
      name: 'Tomatoes',
      grade: 'A',
      sellingType: 'wholesale',
      unit: 'kg',
      expirationDate: null,
      price: 45,
      quantity: 100,
      status: 'active',
    },
    {
      id: 'prod-3',
      name: 'Carrots',
      grade: 'A',
      sellingType: 'retail',
      unit: 'kg',
      expirationDate: '2026-12-15',
      status: 'inactive',
    },
  ];

  it('normalizes capitalization and extra whitespace in product names', () => {
    expect(normalizeProductName('  red   CABBAGE  ')).toBe('red cabbage');
    const duplicate = findDuplicateActiveProduct(existingListings, {
      name: '  RED   cabbage ',
      variety: ' organic ',
      grade: 'A',
      sellingType: 'retail',
      unit: 'kg',
      expirationDate: '2026-12-10',
      price: 99,
      quantity: 500,
    });
    expect(duplicate?.id).toBe('prod-1');
  });

  it('blocks duplicate Wholesale listings with empty expiration dates regardless of price or quantity', () => {
    const duplicate = findDuplicateActiveProduct(existingListings, {
      name: 'tomatoes',
      grade: 'A',
      sellingType: 'wholesale',
      unit: 'kg',
      expirationDate: '',
      price: 38,
      quantity: 250,
    });
    expect(duplicate?.id).toBe('prod-2');
  });

  it('allows separate listings when commodity, variety, grade, sales type, unit, or expiration date differs', () => {
    const base = {
      name: 'Red Cabbage',
      variety: 'Organic',
      grade: 'A',
      sellingType: 'retail',
      unit: 'kg',
      expirationDate: '2026-12-10',
    };

    expect(findDuplicateActiveProduct(existingListings, { ...base, name: 'Green Cabbage' })).toBeNull();
    expect(findDuplicateActiveProduct(existingListings, { ...base, variety: 'Standard' })).toBeNull();
    expect(findDuplicateActiveProduct(existingListings, { ...base, grade: 'B' })).toBeNull();
    expect(findDuplicateActiveProduct(existingListings, { ...base, sellingType: 'wholesale' })).toBeNull();
    expect(findDuplicateActiveProduct(existingListings, { ...base, unit: 'sack' })).toBeNull();
    expect(findDuplicateActiveProduct(existingListings, { ...base, expirationDate: '2026-12-20' })).toBeNull();
    expect(findDuplicateActiveProduct(existingListings, { ...base, expirationDate: '' })).toBeNull();
  });

  it('ignores inactive listings and excludes the current product when editing', () => {
    expect(findDuplicateActiveProduct(existingListings, {
      name: 'Carrots',
      grade: 'A',
      sellingType: 'retail',
      unit: 'kg',
      expirationDate: '2026-12-15',
    })).toBeNull();

    expect(findDuplicateActiveProduct(existingListings, existingListings[0], 'prod-1')).toBeNull();
    expect(buildProductDuplicateKey(existingListings[0])).toBeTruthy();
  });
});
