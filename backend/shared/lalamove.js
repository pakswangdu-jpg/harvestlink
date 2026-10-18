export const LALAMOVE_BOOKING_URL = 'https://web.lalamove.com/';

export function isOfficialLalamoveTrackingUrl(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 2048 || /[\s\\]/.test(value.trim())) return false;
  if (!/^https:\/\/([a-z0-9-]+\.)*lalamove\.com(?::443)?([/?#]|$)/i.test(value.trim())) return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' && !url.username && !url.password && !url.port
      && (url.hostname === 'lalamove.com' || url.hostname.endsWith('.lalamove.com'));
  } catch {
    return false;
  }
}

export function lalamoveDeliveryLabel(order, delivery) {
  if (order.deliveryStatus === 'delivered' || order.status === 'completed') return 'Delivered';
  if (order.deliveryStatus === 'out_for_delivery') return 'Out for delivery';
  if (!delivery) return 'Not booked';
  if (delivery.deliveryStatus === 'waiting_for_pickup') return 'Awaiting handover';
  return 'Courier booked';
}
