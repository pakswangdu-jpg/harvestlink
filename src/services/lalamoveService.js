import { apiClient } from './apiClient';

export const LALAMOVE_QUOTE_LABELS = {
  pending: 'Delivery price awaiting confirmation',
  proposed: 'Awaiting buyer price confirmation',
  accepted: 'Delivery total accepted',
  declined: 'Delivery quote declined',
};






export function saveManualLalamoveTrackingLink(orderId, trackingUrl) {
  return apiClient.patch(`/deliveries/${encodeURIComponent(orderId)}/manual-lalamove-tracking`, { trackingUrl });
}

export function manageLalamoveDeliveryQuote(orderId, action, details) {
  return apiClient.patch(`/orders/${encodeURIComponent(orderId)}/lalamove-delivery-quote`, { action, ...details });
}
