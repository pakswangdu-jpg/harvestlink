import { apiClient } from './apiClient';
import { DELIVERY_SEQUENCES } from '../utils/constants';
import { haversineKm, resolveRoutePoints } from '../utils/geo';
import { getCachedRoadRoute } from './routingService';

const ASSUMED_TRANSIT_SPEED_KMH = 25;
const MIN_ESTIMATED_MINUTES = 5;

// Pure, synchronous — computed purely from an order object already in memory, so this
// needs no backend route at all. Unchanged from before the migration.
//
// Approximates a live, Maxim/Grab-style tracker on top of a step-based (not real-GPS)
// delivery model: once the order is actually out for delivery, its on-map position and
// ETA advance continuously with real elapsed time since that step started (order.updatedAt)
// against an assumed travel speed, instead of jumping straight to each step's fixed
// fraction the moment a farmer marks it. Buyer pickup has no "in transit" leg — the buyer
// travels there on their own schedule — so it's excluded entirely.
export function getLiveTransitProgress(order) {
  const sequence = getDeliverySequence(order.deliveryMethod);
  const stepIndex = Math.max(0, sequence.indexOf(order.deliveryStatus));
  const isFinalStep = stepIndex === sequence.length - 1;
  const isPickup = order.deliveryMethod === 'buyer_pickup';
  const transitStatus = sequence[sequence.length - 2];
  const isInTransit = !isPickup && order.deliveryStatus === transitStatus;

  // Estimated total trip duration, available from the moment the order is confirmed — not
  // only once it's actually out for delivery — so the buyer gets a rough delivery estimate
  // right away instead of waiting until the farmer has finished preparing it. Buyer pickup
  // has no delivery leg to estimate (the buyer travels there on their own schedule).
  let estimatedTotalMinutes = null;
  if (!isPickup) {
    const { origin, destination } = resolveRoutePoints({
      id: order.id,
      originMunicipality: order.originMunicipality,
      destinationMunicipality: order.deliveryMunicipality,
      deliveryMethod: order.deliveryMethod,
    });
    const cachedRoute = getCachedRoadRoute(origin, destination);
    estimatedTotalMinutes = cachedRoute
      ? Math.max(MIN_ESTIMATED_MINUTES, cachedRoute.durationMinutes)
      : Math.max(MIN_ESTIMATED_MINUTES, (haversineKm(origin, destination) / ASSUMED_TRANSIT_SPEED_KMH) * 60);
  }

  if (!isInTransit) {
    const progress = sequence.length > 1 ? stepIndex / (sequence.length - 1) : 0;
    return { progress: isFinalStep ? 1 : progress, etaMinutes: null, estimatedTotalMinutes, isInTransit: false };
  }

  const elapsedMinutes = (Date.now() - new Date(order.updatedAt).getTime()) / 60000;
  const transitFraction = Math.min(1, Math.max(0, elapsedMinutes / estimatedTotalMinutes));

  const stepStartProgress = stepIndex / (sequence.length - 1);
  const stepEndProgress = (stepIndex + 1) / (sequence.length - 1);
  const progress = stepStartProgress + (stepEndProgress - stepStartProgress) * transitFraction;
  const etaMinutes = Math.ceil(estimatedTotalMinutes * (1 - transitFraction));

  return { progress, etaMinutes, estimatedTotalMinutes, isInTransit: true };
}

export async function getOrders() {
  return apiClient.get('/orders');
}

export async function getOrderById(id) {
  return apiClient.get(`/orders/${id}`);
}

export async function getOrdersByBuyer(buyerId) {
  return apiClient.get(`/orders?buyerId=${buyerId}`);
}

export async function getOrdersByFarmer(farmerId) {
  return apiClient.get(`/orders?farmerId=${farmerId}`);
}

// `product`/`buyer` are no longer needed — the backend resolves the product and
// snapshots the authenticated caller's own name — but kept as parameters so call
// sites don't need to change.
export async function createOrder(values) {
  return apiClient.post('/orders', values);
}

export async function updateOrderStatus(id, status) {
  return apiClient.patch(`/orders/${id}/status`, { status });
}

export async function cancelOrder(id) {
  return apiClient.patch(`/orders/${id}/cancel`);
}

export async function advanceDelivery(id) {
  return apiClient.patch(`/orders/${id}/advance-delivery`);
}

export async function payOrder(id) {
  return apiClient.patch(`/orders/${id}/pay`);
}

// Pure, synchronous helpers — unchanged from before the migration.
export function getDeliverySequence(deliveryMethod) {
  return DELIVERY_SEQUENCES[deliveryMethod] || DELIVERY_SEQUENCES.farmer_delivery;
}

export function getNextDeliveryStatus(order) {
  const sequence = getDeliverySequence(order.deliveryMethod);
  const currentIndex = sequence.indexOf(order.deliveryStatus);
  if (currentIndex === -1 || currentIndex === sequence.length - 1) return null;
  return sequence[currentIndex + 1];
}

export function isCancellable(order) {
  return order.status === 'pending' || (order.status === 'confirmed' && order.deliveryStatus === 'pending');
}
