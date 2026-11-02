import assert from 'node:assert/strict';
import { test } from 'node:test';
import { serializeMessage, serializeOrder, serializeProduct } from '../src/lib/serialize.js';

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

test('serializes a product image gallery and falls back to the legacy cover photo', () => {
  const gallery = ['https://img.test/one.jpg', 'https://img.test/two.jpg'];
  assert.deepEqual(serializeProduct({ ...product, image_url: gallery[0], image_urls: gallery }).imageUrls, gallery);
  assert.deepEqual(serializeProduct({ ...product, image_url: gallery[0] }).imageUrls, [gallery[0]]);
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

test('serializes unified conversation and immutable donation context', () => {
  const serialized = serializeMessage({
    id: 'message-1',
    conversation_id: 'conversation-1',
    sender_id: 'stakeholder-1',
    recipient_id: 'farmer-1',
    sender_name: 'HarvestLink',
    sender_role: 'system',
    message_type: 'system',
    context_donation_id: 'donation-1',
    context_donation_name: 'Cabbage',
    context_donation_description: 'Freshly harvested',
    context_donation_quantity: '4.5',
    context_donation_unit: 'kg',
    context_donation_expiration_at: '2026-11-02T09:00:00.000Z',
    context_donation_expiration_date: '2026-11-02',
    created_at: '2026-10-31T00:00:00.000Z',
  });

  assert.equal(serialized.conversationId, 'conversation-1');
  assert.equal(serialized.messageType, 'system');
  assert.equal(serialized.donationContext.donationId, 'donation-1');
  assert.equal(serialized.donationContext.availableQuantity, 4.5);
  assert.equal(serialized.donationContext.expirationDate, '2026-11-02');
});
