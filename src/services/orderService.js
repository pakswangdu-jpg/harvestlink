import { apiClient } from './apiClient';
import { DELIVERY_SEQUENCES } from '../utils/constants';
import { haversineKm, resolveRoutePoints } from '../utils/geo';
import { getCachedRoadRoute } from './routingService';

const ASSUMED_TRANSIT_SPEED_KMH = 25;
const MIN_ESTIMATED_MINUTES = 5;
// A farmer sharing their location pings roughly every 3-5s (see
// useFarmerActiveDeliverySharing.js) — anything older than this means the tab sharing it was
// closed or lost connection, so the map falls back to the time-estimated position rather than
// trusting a frozen dot forever.
const LIVE_LOCATION_FRESHNESS_MS = 3 * 60 * 1000;
// "Near destination" for the delivery-tracking UI (see OrderTracking.jsx) — under live GPS
// this is a real remaining-distance check (~400m, matching the Grab-style live tracking
// modal's own threshold — see LiveTrackingModal.jsx); under the time-estimated fallback (no
// GPS yet) it's a proxy based on how much of the estimated trip time has elapsed instead,
// since there's no real position to measure a distance from.
const NEAR_DESTINATION_KM_THRESHOLD = 0.4;
const NEAR_DESTINATION_PROGRESS_THRESHOLD = 0.9;

// Pure, synchronous — computed purely from an order object already in memory, so this
// needs no backend route at all. Unchanged from before the migration.
//
// Approximates a live, Maxim/Grab-style tracker on top of a step-based delivery model: once
// the order is actually out for delivery, its on-map position and ETA advance continuously.
// When the farmer has opted into live location sharing (order.currentLat/Lng, updated
// recently), that real GPS fix drives both — otherwise it falls back to real elapsed time
// since the transit step started (order.transitStartedAt) against an assumed travel speed,
// instead of jumping straight to each step's fixed fraction the moment a farmer marks it.
// Buyer pickup has no "in transit" leg — the buyer travels there on their own schedule — so
// it's excluded entirely.
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
  let origin = null;
  let destination = null;
  let cachedRoute = null;
  if (!isPickup) {
    ({ origin, destination } = resolveRoutePoints({
      id: order.id,
      originMunicipality: order.originMunicipality,
      destinationMunicipality: order.deliveryMunicipality,
      deliveryMethod: order.deliveryMethod,
    }));
    cachedRoute = getCachedRoadRoute(origin, destination);
    estimatedTotalMinutes = cachedRoute
      ? Math.max(MIN_ESTIMATED_MINUTES, cachedRoute.durationMinutes)
      : Math.max(MIN_ESTIMATED_MINUTES, (haversineKm(origin, destination) / ASSUMED_TRANSIT_SPEED_KMH) * 60);
  }

  if (!isInTransit) {
    const progress = sequence.length > 1 ? stepIndex / (sequence.length - 1) : 0;
    return {
      progress: isFinalStep ? 1 : progress,
      etaMinutes: null,
      estimatedTotalMinutes,
      isInTransit: false,
      currentPosition: null,
      isLiveGps: false,
      remainingKm: null,
      averageSpeedKmh: null,
      isNearDestination: false,
    };
  }

  const stepStartProgress = stepIndex / (sequence.length - 1);
  const stepEndProgress = (stepIndex + 1) / (sequence.length - 1);

  const hasFreshGps = order.currentLat != null && order.currentLng != null && order.locationUpdatedAt
    && Date.now() - new Date(order.locationUpdatedAt).getTime() < LIVE_LOCATION_FRESHNESS_MS;

  if (hasFreshGps) {
    // heading/speed are raw device sensor readings, not always present even while moving
    // (see supabase/schema.sql) — carried along so a consumer that wants the real device
    // heading (e.g. to orient a marker) doesn't have to reach past this object for it.
    const currentPosition = { lat: order.currentLat, lng: order.currentLng, heading: order.currentHeading, speed: order.currentSpeed };
    const remainingKm = haversineKm(currentPosition, destination);
    const totalKm = cachedRoute?.distanceKm ?? haversineKm(origin, destination);
    const averageSpeedKmh = cachedRoute ? cachedRoute.distanceKm / (cachedRoute.durationMinutes / 60) : ASSUMED_TRANSIT_SPEED_KMH;
    const transitFraction = totalKm > 0 ? Math.min(1, Math.max(0, 1 - remainingKm / totalKm)) : 1;
    const etaMinutes = Math.max(0, Math.ceil((remainingKm / averageSpeedKmh) * 60));
    const progress = stepStartProgress + (stepEndProgress - stepStartProgress) * transitFraction;
    const isNearDestination = remainingKm <= NEAR_DESTINATION_KM_THRESHOLD;
    return {
      progress, etaMinutes, estimatedTotalMinutes, isInTransit: true, currentPosition, isLiveGps: true,
      remainingKm, averageSpeedKmh, isNearDestination,
    };
  }

  // transitStartedAt is set the moment the order actually entered this step (see the
  // backend's advanceDelivery) — older orders that predate that column fall back to
  // updatedAt, which is a reasonable approximation for them since they can't have any GPS
  // pings (and thus no location-driven updates) muddying that timestamp anyway.
  const transitAnchor = order.transitStartedAt || order.updatedAt;
  const elapsedMinutes = (Date.now() - new Date(transitAnchor).getTime()) / 60000;
  const transitFraction = Math.min(1, Math.max(0, elapsedMinutes / estimatedTotalMinutes));
  const progress = stepStartProgress + (stepEndProgress - stepStartProgress) * transitFraction;
  const etaMinutes = Math.ceil(estimatedTotalMinutes * (1 - transitFraction));
  const averageSpeedKmh = cachedRoute ? cachedRoute.distanceKm / (cachedRoute.durationMinutes / 60) : ASSUMED_TRANSIT_SPEED_KMH;
  const isNearDestination = transitFraction >= NEAR_DESTINATION_PROGRESS_THRESHOLD;

  return {
    progress, etaMinutes, estimatedTotalMinutes, isInTransit: true, currentPosition: null, isLiveGps: false,
    remainingKm: null, averageSpeedKmh, isNearDestination,
  };
}

// Collapses the order's real status/deliveryStatus columns (which have more granular steps —
// preparing, packed, etc.) into the 5-stage model the delivery-tracking UI shows (see
// OrderTracking.jsx) — Pending / Confirmed / On the Way / Near Destination / Delivered, plus
// the two terminal non-delivery outcomes. Takes isInTransit/isNearDestination from
// getLiveTransitProgress rather than recomputing them, since callers already have that object.
export function getDeliveryTrackingStatus(order, isInTransit, isNearDestination) {
  if (order.status === 'rejected') return { key: 'rejected', label: 'Rejected' };
  if (order.status === 'cancelled') return { key: 'cancelled', label: 'Cancelled' };
  if (order.status === 'pending') return { key: 'pending', label: 'Pending' };
  if (order.status === 'completed') return { key: 'delivered', label: 'Delivered' };
  if (isInTransit) {
    return isNearDestination ? { key: 'near-destination', label: 'Near Destination' } : { key: 'on-the-way', label: 'On the Way' };
  }
  return { key: 'confirmed', label: 'Confirmed' };
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

export async function updateOrderLocation(id, { lat, lng }) {
  return apiClient.patch(`/orders/${id}/location`, { lat, lng });
}

// Mirrors the backend's serializeOrder (see backend/src/lib/serialize.js) — a Supabase
// Realtime payload is a raw snake_case Postgres row, not something that went through the
// backend's serializer, so this keeps it in the same camelCase shape every other order
// object in the app already has. Used by OrderTracking.jsx's live subscription.
export function mapOrderRealtimeRow(row) {
  return {
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    unit: row.unit,
    unitPrice: Number(row.unit_price),
    farmerId: row.farmer_id,
    farmerName: row.farmer_name,
    buyerId: row.buyer_id,
    buyerName: row.buyer_name,
    quantity: Number(row.quantity),
    deliveryFee: Number(row.delivery_fee || 0),
    totalAmount: Number(row.total_amount),
    message: row.message || '',
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    deliveryMethod: row.delivery_method,
    deliveryStatus: row.delivery_status,
    originMunicipality: row.origin_municipality,
    deliveryMunicipality: row.delivery_municipality,
    status: row.status,
    currentLat: row.current_lat == null ? null : Number(row.current_lat),
    currentLng: row.current_lng == null ? null : Number(row.current_lng),
    currentHeading: row.current_heading == null ? null : Number(row.current_heading),
    currentSpeed: row.current_speed == null ? null : Number(row.current_speed),
    currentAccuracy: row.current_accuracy == null ? null : Number(row.current_accuracy),
    locationUpdatedAt: row.location_updated_at,
    transitStartedAt: row.transit_started_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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
