// The one place Lalamove's own order-status vocabulary gets translated into HarvestLink's —
// used by both createLalamoveDeliveryForOrder (orders.controller.js, the initial ASSIGNING_DRIVER
// write) and the webhook handler (webhooks/lalamoveWebhook.controller.js, every update after
// that). Buyer-facing copy is deliberately plain — no "ASSIGNING_DRIVER" API jargon reaching
// the buyer's screen (see CourierDeliveryTimeline.jsx).
export const LALAMOVE_STATUS_MAP = {
  ASSIGNING_DRIVER: {
    deliveryStatus: 'assigning_driver',
    title: 'Looking for a driver',
    description: 'Looking for a delivery driver.',
  },
  ON_GOING: {
    deliveryStatus: 'driver_assigned',
    title: 'Driver assigned',
    description: 'A Lalamove driver has been assigned.',
  },
  PICKED_UP: {
    deliveryStatus: 'picked_up',
    title: 'Picked up',
    description: 'Your order has been picked up from the farmer.',
  },
  COMPLETED: {
    deliveryStatus: 'delivered',
    title: 'Delivered',
    description: 'Your order has been delivered.',
  },
  // REJECTED (two drivers in a row declined) and EXPIRED (no driver accepted in time) are
  // both dead ends from the buyer's point of view — same message as an explicit cancellation,
  // since "rejected by a driver" vs "expired" isn't a distinction a buyer can act on.
  CANCELED: {
    deliveryStatus: 'cancelled',
    title: 'Delivery cancelled',
    description: 'This delivery was cancelled.',
  },
  REJECTED: {
    deliveryStatus: 'cancelled',
    title: 'Delivery cancelled',
    description: 'This delivery was cancelled.',
  },
  EXPIRED: {
    deliveryStatus: 'cancelled',
    title: 'Delivery cancelled',
    description: 'This delivery was cancelled.',
  },
};

// Monotonic rank — a webhook event only gets applied if it represents forward progress (or a
// cancellation, always applied). This is what makes processing safe against Lalamove
// redelivering the same event (a no-op re-application) or delivering events out of order (a
// stale ASSIGNING_DRIVER arriving after ON_GOING already landed never rewinds the order).
const STATUS_RANK = ['assigning_driver', 'driver_assigned', 'picked_up', 'delivered'];

export function isForwardProgress(currentDeliveryStatus, nextDeliveryStatus) {
  if (nextDeliveryStatus === 'cancelled') return currentDeliveryStatus !== 'delivered';
  const currentRank = STATUS_RANK.indexOf(currentDeliveryStatus);
  const nextRank = STATUS_RANK.indexOf(nextDeliveryStatus);
  if (nextRank === -1) return false;
  return nextRank > currentRank;
}
