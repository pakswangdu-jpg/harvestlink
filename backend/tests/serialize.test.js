import assert from 'node:assert/strict';
import { test } from 'node:test';
import { serializeOrder, serializeProduct } from '../src/lib/serialize.js';

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

test('serializes decimal wholesale fields and preserves legacy listings without a tier', () => {
  const serialized = serializeProduct({ ...product, wholesale_price: '48.50', wholesale_min_quantity: '10.25' });
  assert.equal(serialized.wholesalePrice, 48.5);
  assert.equal(serialized.wholesaleMinQuantity, 10.25);
  const legacy = serializeProduct({ ...product, selling_type: 'wholesale', moq: '5' });
  assert.equal(legacy.price, 50);
  assert.equal(legacy.moq, 5);
  assert.equal(legacy.wholesalePrice, null);
  assert.equal(legacy.wholesaleMinQuantity, null);
});

test('serializes a tracked delivery vehicle plate number', () => {
  const serialized = serializeOrder({
    id: 'order-1',
    vehicle_plate_number: 'ABC 1234',
    unit_price: 50,
    quantity: 1,
    total_amount: 50,
  });

  assert.equal(serialized.vehiclePlateNumber, 'ABC 1234');
});
