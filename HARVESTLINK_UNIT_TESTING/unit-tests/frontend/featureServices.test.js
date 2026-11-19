import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../../../src/services/apiClient.js';
import * as catalog from '../../../src/services/catalogService.js';
import * as donations from '../../../src/services/donationService.js';
import * as messages from '../../../src/services/messageService.js';
import * as notifications from '../../../src/services/notificationService.js';
import * as orders from '../../../src/services/orderService.js';
import * as payments from '../../../src/services/paymentService.js';
import * as products from '../../../src/services/productService.js';

vi.mock('../../../src/services/apiClient.js', () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

beforeEach(() => vi.resetAllMocks());

describe('Feature service API contracts', () => {
  it('requests inactive catalog entries and sends catalog edits', async () => {
    await catalog.getCatalog({ includeInactive: true });
    await catalog.updateCategory('vegetables', { sortOrder: 3 });
    await catalog.createUnit({ name: 'Kilogram', abbreviation: 'kg' });
    expect(apiClient.get).toHaveBeenCalledWith('/catalog?includeInactive=true');
    expect(apiClient.patch).toHaveBeenCalledWith('/catalog/categories/vegetables', { sortOrder: 3 });
    expect(apiClient.post).toHaveBeenCalledWith('/catalog/units', { name: 'Kilogram', abbreviation: 'kg' });
  });

  it('loads the public marketplace and submits a listing for price review', async () => {
    await products.getMarketplaceProducts();
    await products.approvePriceReview('p1', { reason: 'Reference price verified' });
    expect(apiClient.get).toHaveBeenCalledWith('/products/marketplace', { fresh: true });
    expect(apiClient.post).toHaveBeenCalledWith('/products/p1/price-review/approve', { reason: 'Reference price verified' });
  });

  it('preserves the quote payload and encodes the receipt identifier', async () => {
    const checkout = { items: [{ productId: 'p1', quantity: 2 }], deliveryMethod: 'buyer_pickup' };
    apiClient.post.mockResolvedValue({ total: 120 });
    await expect(orders.getCheckoutQuote(checkout)).resolves.toEqual({ total: 120 });
    await orders.getOrderReceipt('order/1');
    expect(apiClient.post).toHaveBeenCalledWith('/orders/quote', checkout);
    expect(apiClient.get).toHaveBeenCalledWith('/orders/order%2F1/receipt');
  });

  it('sends a payment review reason and propagates API failures', async () => {
    const failure = new Error('Review unavailable');
    apiClient.patch.mockRejectedValueOnce(failure);
    await expect(payments.rejectPaymentVerification('o1', 'Reference mismatch')).rejects.toBe(failure);
    expect(apiClient.patch).toHaveBeenCalledWith('/payments/gcash/o1/reject', { reason: 'Reference mismatch' });
  });

  it('sends pickup locations to the donation or its individual claim', async () => {
    const location = { lat: 13.41, lng: 123.41 };
    await donations.updateDonationPickupLocation('d/1', location);
    await donations.updateDonationPickupLocation('d/1', location, 'c/1');
    expect(apiClient.patch).toHaveBeenNthCalledWith(1, '/donations/d%2F1/location', location);
    expect(apiClient.patch).toHaveBeenNthCalledWith(2, '/donations/claims/c%2F1/location', location);
  });

  it('rejects empty messages and accepts attachment-only messages', async () => {
    await expect(messages.sendDirectMessage('buyer1', '  ')).rejects.toThrow('Enter a message');
    expect(apiClient.post).not.toHaveBeenCalled();
    const attachment = { imageUrl: 'https://example.test/photo.png' };
    await messages.sendDirectMessage('buyer1', '  ', attachment);
    expect(apiClient.post).toHaveBeenCalledWith('/messages', { recipientId: 'buyer1', text: '', ...attachment });
  });

  it('uses the supplied cursor and limit for message history', async () => {
    await messages.getDirectMessages('buyer+1', { before: '2026-11-19T08:00:00Z', limit: 20 });
    expect(apiClient.get).toHaveBeenCalledWith('/messages?otherUserId=buyer%2B1&before=2026-11-19T08%3A00%3A00Z&limit=20');
  });

  it('counts unread notifications and uses the bulk read endpoint', async () => {
    apiClient.get.mockResolvedValue([{ read: false }, { read: true }, { read: false }]);
    await expect(notifications.getUnreadCount()).resolves.toBe(2);
    await notifications.markAllNotificationsRead();
    expect(apiClient.get).toHaveBeenCalledWith('/notifications');
    expect(apiClient.patch).toHaveBeenCalledWith('/notifications/read-all');
  });
});
