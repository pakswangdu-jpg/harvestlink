import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../backend/src/lib/deliveryFee.js', () => ({
  calculateDeliveryFee: vi.fn(async () => ({ fee: 30, distanceKm: 2, durationMinutes: 10 })),
}));
vi.mock('../../../backend/src/lib/lalamoveClient.js', () => ({
  getQuotation: vi.fn(async () => ({ fee: 90, distanceKm: 3, durationMinutes: 15 })),
}));

import { buildCheckoutQuote } from '../../../backend/src/lib/checkoutQuote.js';

describe('Checkout quote business logic', () => {
  const product = {
    quantity: 10,
    status: 'active',
    price: 50,
    wholesale_price: null,
    wholesale_min_quantity: null,
    selling_type: 'retail',
    location: 'Mandaue City',
    price_review: null,
  };
  it('calculates a buyer-pickup subtotal and zero/route estimate', async () => {
    const quote = await buildCheckoutQuote(product, {
      quantity: 2, deliveryMethod: 'buyer_pickup', deliveryMunicipality: 'Cebu City',
    });
    expect(quote.subtotal).toBe(100);
    expect(quote.total).toBeGreaterThanOrEqual(100);
  });
  it('rejects invalid quantities', async () => {
    await expect(buildCheckoutQuote(product, { quantity: 0, deliveryMethod: 'buyer_pickup' }))
      .rejects.toMatchObject({ status: 400 });
  });
  it('rejects unavailable listings', async () => {
    await expect(buildCheckoutQuote({ ...product, status: 'inactive' }, {
      quantity: 1, deliveryMethod: 'buyer_pickup',
    })).rejects.toMatchObject({ status: 400 });
  });
});
