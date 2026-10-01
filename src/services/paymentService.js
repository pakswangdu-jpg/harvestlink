import { apiClient } from './apiClient';









export async function getGcashCheckout(orderId) {
  return apiClient.get(`/payments/gcash/${orderId}`);
}




export async function submitPaymentProof(orderId, payload) {
  return apiClient.post(`/payments/gcash/${orderId}/confirm`, payload);
}



export async function approvePaymentVerification(orderId) {
  return apiClient.patch(`/payments/gcash/${orderId}/approve`);
}



export async function rejectPaymentVerification(orderId, reason) {
  return apiClient.patch(`/payments/gcash/${orderId}/reject`, { reason });
}
