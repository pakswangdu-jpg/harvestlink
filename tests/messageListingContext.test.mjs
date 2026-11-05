import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getListingContextMessageIds } from '../src/utils/messageListingContext.js';

test('message history shows the product on every product inquiry message', () => {
  const messages = [
    { id: 'm1', productContext: { productId: 'cabbage' } },
    { id: 'm2', productContext: { productId: 'cabbage' } },
    { id: 'm3', text: 'Plain follow-up' },
    { id: 'm4', productContext: { productId: 'cabbage' } },
    { id: 'm5', productContext: { productId: 'tomato' } },
    { id: 'm6', donationContext: { donationId: 'donation-1' } },
    { id: 'm7', donationContext: { donationId: 'donation-1' } },
    { id: 'm8', productContext: { productId: 'cabbage' } },
  ];

  assert.deepEqual(
    [...getListingContextMessageIds(messages)],
    ['m1', 'm2', 'm4', 'm5', 'm6', 'm8'],
  );
});
