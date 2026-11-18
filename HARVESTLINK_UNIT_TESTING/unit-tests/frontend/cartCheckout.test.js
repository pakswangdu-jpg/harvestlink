import { describe, expect, it } from 'vitest';
import { validateCheckoutForm } from '../../../src/utils/validators.js';

describe('Cart and checkout validation', () => {
  it('requires quantity, payment, and delivery method', () => {
    const errors = validateCheckoutForm({
      quantity: '', paymentMethod: '', deliveryMethod: '',
    }, { quantity: 10 }, { id: 'buyer-1' });
    expect(errors.quantity).toBeTruthy();
    expect(errors.paymentMethod).toBeTruthy();
    expect(errors.deliveryMethod).toBeTruthy();
  });
  it('rejects quantities above stock', () => {
    const errors = validateCheckoutForm({
      quantity: '11', paymentMethod: 'cod', deliveryMethod: 'buyer_pickup',
    }, { quantity: 10, farmerId: 'farmer-1' }, { id: 'buyer-1' });
    expect(errors.quantity).toBeTruthy();
  });
});
