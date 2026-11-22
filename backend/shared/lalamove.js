export const LALAMOVE_BOOKING_URL = 'https://web.lalamove.com/';
export const MAX_MANUAL_LALAMOVE_FEE = 10000;

export function validateManualLalamoveFee(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    && value <= MAX_MANUAL_LALAMOVE_FEE && Number(value.toFixed(2)) === value;
}

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
  if (normalizeManualLalamoveTrackingUrl(order.manualLalamoveTrackingUrl)) return 'Tracking link provided';
  if (!delivery) return 'Awaiting external booking';
  if (delivery.deliveryStatus === 'waiting_for_pickup') return 'Awaiting handover';
  return 'External booking recorded';
}

export function normalizeManualLalamoveTrackingUrl(value) {
  if (!isOfficialLalamoveTrackingUrl(value) || /\p{Cc}/u.test(value.trim())) return null;
  const url = new URL(value.trim());
  if (url.hostname !== 'share.lalamove.com' || (url.pathname === '/' && !url.search && !url.hash)) return null;
  return url.href.length <= 2048 ? url.href : null;
}
