import { apiClient } from './apiClient';

// Demo GCash payment module — see backend/src/controllers/payments.controller.js. Both
// calls are scoped to an order that already exists (created via the normal checkout flow
// with paymentMethod: 'gcash'); this service only drives the simulated payment step on top
// of it.

// { order, merchantName, referenceNumber } — the reference number is display-only and
// regenerated on every call, not persisted; see the controller for why.
export async function getGcashCheckout(orderId) {
  return apiClient.get(`/payments/gcash/${orderId}`);
}

// Called once the frontend's simulated "processing" animation finishes. Returns the updated
// order with paymentStatus: 'paid' and a real, persisted transactionId.
export async function confirmGcashPayment(orderId) {
  return apiClient.post(`/payments/gcash/${orderId}/confirm`);
}
