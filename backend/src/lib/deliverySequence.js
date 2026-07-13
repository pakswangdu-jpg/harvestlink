import { DELIVERY_SEQUENCES } from '../utils/constants.js';

// Ported verbatim from src/services/orderService.js — pure functions, used server-side to
// validate delivery-step transitions before writing them (the frontend keeps its own copy
// too, for UI logic like disabling a "mark next step" button — see orderService.js).
export function getDeliverySequence(deliveryMethod) {
  return DELIVERY_SEQUENCES[deliveryMethod] || DELIVERY_SEQUENCES.farmer_delivery;
}

export function getNextDeliveryStatus(order) {
  const sequence = getDeliverySequence(order.delivery_method);
  const currentIndex = sequence.indexOf(order.delivery_status);
  if (currentIndex === -1 || currentIndex === sequence.length - 1) return null;
  return sequence[currentIndex + 1];
}

export function isCancellable(order) {
  return order.status === 'pending' || (order.status === 'confirmed' && order.delivery_status === 'pending');
}
