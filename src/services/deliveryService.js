import { apiClient } from './apiClient';

// Third-party courier (Lalamove) delivery coordination — see
// backend/src/controllers/deliveries.controller.js. HarvestLink stores only what the farmer
// enters after booking on Lalamove's own site/app; it never tracks a courier's GPS itself.

// { id, orderId, courierCompany, driverName, driverPhone, vehicleType, bookingReference,
//   trackingUrl, estimatedArrival, deliveryStatus, createdAt, updatedAt } | null — null
// means no courier has been booked for this order yet, not an error.
export async function getDelivery(orderId) {
  return apiClient.get(`/deliveries/${orderId}`);
}

// Farmer-only. Records the Lalamove booking and advances the order to "out for delivery" in
// one step — see FarmerOrders.jsx / OrderTracking.jsx's "Book Lalamove Delivery" flow.
// Returns { order, delivery }.
export async function bookDelivery(orderId, payload) {
  return apiClient.post('/deliveries', { orderId, ...payload });
}
