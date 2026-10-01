import assert from 'node:assert/strict';
import { test } from 'node:test';
import { serializeProduct } from '../src/lib/serialize.js';

const product = {
  id: 'product-1',
  farmer_id: 'farmer-1',
  name: 'Cabbage',
  price: 50,
  quantity: 10,
};

test('serializes GCash availability without exposing farmer payment details', () => {
  const serialized = serializeProduct(product, { farmerGcashEnabled: true });

  assert.equal(serialized.farmerGcashEnabled, true);
  assert.equal('gcashAccountName' in serialized, false);
  assert.equal('gcashQrUrl' in serialized, false);
});

test('defaults GCash availability to false when farmer setup is missing', () => {
  assert.equal(serializeProduct(product).farmerGcashEnabled, false);
});
