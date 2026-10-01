import { apiClient } from './apiClient';








export async function getDelivery(orderId) {
  return apiClient.get(`/deliveries/${orderId}`);
}




export async function bookDelivery(orderId, payload) {
  return apiClient.post('/deliveries', { orderId, ...payload });
}




export async function updateDelivery(orderId, payload) {
  return apiClient.patch(`/deliveries/${orderId}`, payload);
}




export async function updateDeliveryStatus(orderId, status) {
  return apiClient.patch(`/deliveries/${orderId}/status`, { status });
}
