import { apiClient } from './apiClient';

// GCash payment module — see backend/src/controllers/payments.controller.js. All calls are
// scoped to an order that already exists (created via the normal checkout flow with
// paymentMethod: 'gcash'); this service drives the real payment step on top of it — the
// farmer's own stored GCash details, the buyer's submitted proof of payment, and the
// farmer's approve/reject review of it.

// { order, merchantName, gcash: { accountName, number, qrUrl } } — the farmer's real,
// profile-stored GCash details for this specific order's farmer.
export async function getGcashCheckout(orderId) {
  return apiClient.get(`/payments/gcash/${orderId}`);
}

// Submits proof of payment (receipt URL + reference number + sender name + payment
// datetime + optional notes) — puts the order into paymentVerificationStatus: 'pending'.
// Does NOT mark the order paid; see approvePaymentVerification.
export async function submitPaymentProof(orderId, payload) {
  return apiClient.post(`/payments/gcash/${orderId}/confirm`, payload);
}

// Farmer-only. Returns the updated order with paymentStatus: 'paid' and a generated
// transactionId.
export async function approvePaymentVerification(orderId) {
  return apiClient.patch(`/payments/gcash/${orderId}/approve`);
}

// Farmer-only, requires a reason. Leaves paymentStatus 'pending' so the buyer can correct
// and resubmit.
export async function rejectPaymentVerification(orderId, reason) {
  return apiClient.patch(`/payments/gcash/${orderId}/reject`, { reason });
}
