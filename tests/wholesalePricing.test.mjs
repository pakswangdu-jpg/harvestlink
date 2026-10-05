import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getApplicableUnitPrice,
  getRecommendedWholesalePrice,
  getSuggestedWholesaleMinimum,
  getWholesalePricingErrors,
  isWholesaleQuantity,
} from '../backend/shared/pricing.js';

test('the saved wholesale price applies at and above its minimum only', () => {
  const product = {
    price: 55,
    wholesalePrice: 48,
    wholesaleMinQuantity: 10,
  };

  assert.equal(getApplicableUnitPrice(product, 9), 55);
  assert.equal(getApplicableUnitPrice(product, 10), 48);
  assert.equal(getApplicableUnitPrice(product, 25), 48);
});

test('legacy products without dual pricing retain their saved unit price', () => {
  assert.equal(getApplicableUnitPrice({ price: 32, sellingType: 'wholesale', moq: 5 }, 10), 32);
});

test('suggested wholesale minimum is quantity-based and never exceeds available stock', () => {
  assert.equal(getSuggestedWholesaleMinimum(100), 10);
  assert.equal(getSuggestedWholesaleMinimum(4), 1);
  assert.equal(getSuggestedWholesaleMinimum(0.5), 0.5);
  assert.equal(getSuggestedWholesaleMinimum(0), null);
});

test('wholesale recommendation shares available retail profit and will not price below cost', () => {
  assert.equal(getRecommendedWholesalePrice(55, 30), 42.5);
  assert.equal(getRecommendedWholesalePrice(30, 30), null);
  assert.equal(getRecommendedWholesalePrice(25, 30), null);
  assert.equal(getRecommendedWholesalePrice(30.01, 30), null);
});

test('decimal quantities and prices use the saved threshold without rounding the order up', () => {
  const product = { price: '55.50', wholesalePrice: '48.25', wholesaleMinQuantity: '10.25' };
  assert.equal(getApplicableUnitPrice(product, '10.24'), 55.5);
  assert.equal(getApplicableUnitPrice(product, '10.25'), 48.25);
  assert.equal(isWholesaleQuantity(product, '10.25'), true);
});

test('incomplete or invalid tiers and non-finite quantities never apply wholesale pricing', () => {
  const product = { price: 55, wholesalePrice: 48, wholesaleMinQuantity: 10 };
  for (const override of [
    { wholesalePrice: null }, { wholesalePrice: 0 }, { wholesalePrice: -5 },
    { wholesalePrice: 55 }, { wholesalePrice: 60 }, { wholesalePrice: Infinity },
    { wholesaleMinQuantity: null }, { wholesaleMinQuantity: 0 }, { wholesaleMinQuantity: Infinity },
  ]) {
    assert.equal(getApplicableUnitPrice({ ...product, ...override }, 10), 55);
    assert.equal(isWholesaleQuantity({ ...product, ...override }, 10), false);
  }
  for (const quantity of [NaN, Infinity, -1, null, 'invalid']) {
    assert.equal(getApplicableUnitPrice(product, quantity), 55);
  }
});

test('tier validation rejects invalid amounts and new thresholds above stock but permits depleted saved tiers', () => {
  const values = { price: 55, wholesalePrice: 48, wholesaleMinQuantity: 10, quantity: 100, unit: 'kg' };
  assert.deepEqual(getWholesalePricingErrors(values), {});
  for (const wholesalePrice of [-1, 0, '', NaN, Infinity, 55, 55.001, 48.123]) {
    assert.ok(getWholesalePricingErrors({ ...values, wholesalePrice }).wholesalePrice);
  }
  for (const wholesaleMinQuantity of [-1, 0, '', NaN, Infinity, 101, 10.001]) {
    assert.ok(getWholesalePricingErrors({ ...values, wholesaleMinQuantity }).wholesaleMinQuantity);
  }
  assert.deepEqual(getWholesalePricingErrors({ ...values, quantity: 3 }, values), {});
  assert.ok(getWholesalePricingErrors({ ...values, quantity: 3 }).wholesaleMinQuantity);
  assert.ok(getWholesalePricingErrors({ ...values, quantity: 3, wholesaleMinQuantity: 11 }, values).wholesaleMinQuantity);
  assert.ok(getWholesalePricingErrors({ ...values, quantity: 3, unit: 'box' }, values).wholesaleMinQuantity);
});
