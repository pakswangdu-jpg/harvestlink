import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

const context = vm.createContext({});
const entry = new URL('../src/utils/validators.js', import.meta.url);
const validator = new vm.SourceTextModule(await readFile(entry, 'utf8'), { context, identifier: entry.href });
await validator.link(async (specifier, parent) => {
  const url = new URL(specifier.endsWith('.js') ? specifier : `${specifier}.js`, parent.identifier);
  return new vm.SourceTextModule(await readFile(url, 'utf8'), { context, identifier: url.href });
});
await validator.evaluate();
const { validateProductForm, validateCheckoutForm } = validator.namespace;
const validListing = {
  name: 'Cabbage', category: 'Vegetables', grade: 'A', sellingType: 'retail',
  unit: 'kg', price: 55, costPrice: 30, quantity: 100, location: 'Mandaue City',
  description: 'Fresh cabbage', image: 'cabbage.jpg',
  wholesaleEnabled: true, wholesalePrice: 48, wholesaleMinQuantity: 10,
};

test('product form validates the saved tier against the discounted retail price', () => {
  assert.equal(Object.keys(validateProductForm(validListing, ['kg'])).length, 0);
  assert.ok(validateProductForm({ ...validListing, discountPercent: 20 }, ['kg']).wholesalePrice);
  assert.ok(validateProductForm({ ...validListing, wholesaleMinQuantity: 101 }, ['kg']).wholesaleMinQuantity);
});

test('hidden tier fields cannot block donation or legacy wholesale-only forms', () => {
  const staleTier = { ...validListing, wholesalePrice: '', wholesaleMinQuantity: '' };
  for (const overrides of [{ wholesaleEnabled: false }, { isDonation: true }, { sellingType: 'wholesale', moq: 5 }]) {
    const errors = validateProductForm({ ...staleTier, ...overrides }, ['kg']);
    assert.equal(errors.wholesalePrice, undefined);
    assert.equal(errors.wholesaleMinQuantity, undefined);
  }
});

test('editing a depleted tier retains its threshold without allowing new oversized thresholds', () => {
  const values = { ...validListing, quantity: 3 };
  assert.equal(validateProductForm(values, ['kg'], validListing).wholesaleMinQuantity, undefined);
  assert.ok(validateProductForm(values, ['kg']).wholesaleMinQuantity);
  assert.ok(validateProductForm({ ...values, wholesaleMinQuantity: 11 }, ['kg'], validListing).wholesaleMinQuantity);
});

test('checkout permits retail orders below the discount threshold and enforces legacy MOQ', () => {
  const values = { quantity: 1, paymentMethod: 'cod', deliveryMethod: 'buyer_pickup' };
  assert.equal(validateCheckoutForm(values, validListing).quantity, undefined);
  assert.ok(validateCheckoutForm(values, { ...validListing, sellingType: 'wholesale', moq: 5 }).quantity);
  assert.equal(validateCheckoutForm({ ...values, quantity: 5 }, { ...validListing, sellingType: 'wholesale', moq: 5 }).quantity, undefined);
});
