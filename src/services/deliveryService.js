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
// one step — see FarmerOrders.jsx / OrderTracking.jsx's "Book with Lalamove" flow.
// Returns { order, delivery }.
export async function bookDelivery(orderId, payload) {
  return apiClient.post('/deliveries', { orderId, ...payload });
}

// Farmer-only. Edits an already-booked delivery's details (tracking link, driver, vehicle,
// booking reference, pickup time) without re-running the booking gate or touching order
// status — see DeliveryInfoCard.jsx's "Edit Delivery Information".
export async function updateDelivery(orderId, payload) {
  return apiClient.patch(`/deliveries/${orderId}`, payload);
}

// Farmer-only. Advances the delivery's own narrated timeline one step
// ('booked' -> 'waiting_for_pickup' -> 'picked_up' -> 'delivered') — see
// CourierDeliveryTimeline.jsx's manual "Mark as" control.
export async function updateDeliveryStatus(orderId, status) {
  return apiClient.patch(`/deliveries/${orderId}/status`, { status });
}
