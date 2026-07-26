import { apiClient } from './apiClient';

// GCash payment module — see backend/src/controllers/payments.controller.js. Both calls are
// scoped to an order that already exists (created via the normal checkout flow with
// paymentMethod: 'gcash'); this service drives the real payment step on top of it — the
// farmer's own stored GCash details, and the buyer's uploaded receipt.

// { order, merchantName, gcash: { accountName, number, qrUrl } } — the farmer's real,
// profile-stored GCash details for this specific order's farmer.
export async function getGcashCheckout(orderId) {
  return apiClient.get(`/payments/gcash/${orderId}`);
}

// Called once the buyer has uploaded their payment receipt (see uploadService.js's
// uploadPaymentReceipt) — `receiptUrl` is that upload's resulting public URL. Returns the
// updated order with paymentStatus: 'paid' and a real, persisted transactionId.
export async function confirmGcashPayment(orderId, receiptUrl) {
  return apiClient.post(`/payments/gcash/${orderId}/confirm`, { receiptUrl });
}
