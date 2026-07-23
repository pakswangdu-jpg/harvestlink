import { apiClient } from './apiClient';

// Real GCash payments via PayMongo — see backend/src/controllers/payments.controller.js and
// backend/src/lib/paymongoService.js. Both calls are scoped to an order that already exists
// (created via the normal checkout flow with paymentMethod: 'gcash').

// { order, redirectUrl } — redirectUrl is PayMongo's own hosted checkout page for this
// order's real Payment Intent; the caller sends the browser there next.
export async function startGcashCheckout(orderId) {
  return apiClient.post(`/payments/gcash/${orderId}/checkout`);
}

// Called once the buyer's browser returns from PayMongo's checkout redirect. Asks the
// backend to confirm the real payment status directly with PayMongo (never trusts the
// redirect alone) before marking the order paid. Returns the updated order once it does.
export async function confirmGcashPayment(orderId) {
  return apiClient.post(`/payments/gcash/${orderId}/confirm`);
}
