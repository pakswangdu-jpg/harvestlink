import { apiClient } from './apiClient';
import { DELIVERY_SEQUENCES, getMunicipalityCoords } from '../utils/constants';
import { haversineKm, resolveRoutePoints } from '../utils/geo';
import { getCachedRoadRoute } from './routingService';

const ASSUMED_TRANSIT_SPEED_KMH = 25;
const MIN_ESTIMATED_MINUTES = 5;




const LIVE_LOCATION_FRESHNESS_MS = 3 * 60 * 1000;





const NEAR_DESTINATION_KM_THRESHOLD = 0.4;
const NEAR_DESTINATION_PROGRESS_THRESHOLD = 0.9;












export function getLiveTransitProgress(order) {
  const sequence = getDeliverySequence(order.deliveryMethod);
  const stepIndex = Math.max(0, sequence.indexOf(order.deliveryStatus));
  const isFinalStep = stepIndex === sequence.length - 1;
  const isPickup = order.deliveryMethod === 'buyer_pickup';





  const isCourier = order.deliveryMethod === 'courier';
  const transitStatus = sequence[sequence.length - 2];





  const isInTransit = !isCourier && order.deliveryStatus === transitStatus;










  let estimatedTotalMinutes = null;
  let origin;
  let destination = null;
  let cachedRoute = null;
  if (isPickup) {
    origin = getMunicipalityCoords(order.originMunicipality);
  } else if (!isCourier) {
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



    const currentPosition = { lat: order.currentLat, lng: order.currentLng, heading: order.currentHeading, speed: order.currentSpeed };







    if (isPickup) {
      const remainingKm = haversineKm(currentPosition, origin);
      const etaMinutes = Math.max(0, Math.ceil((remainingKm / ASSUMED_TRANSIT_SPEED_KMH) * 60));
      const isNearDestination = remainingKm <= NEAR_DESTINATION_KM_THRESHOLD;
      return {
        progress: stepStartProgress, etaMinutes, estimatedTotalMinutes, isInTransit: true, currentPosition, isLiveGps: true,
        remainingKm, averageSpeedKmh: ASSUMED_TRANSIT_SPEED_KMH, isNearDestination,
      };
    }

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





  if (isPickup) {
    return {
      progress: stepStartProgress, etaMinutes: null, estimatedTotalMinutes, isInTransit: true, currentPosition: null, isLiveGps: false,
      remainingKm: null, averageSpeedKmh: null, isNearDestination: false,
    };
  }





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






export function getDeliveryTrackingStatus(order, isInTransit, isNearDestination) {
  const isPickup = order.deliveryMethod === 'buyer_pickup';
  const isCourier = order.deliveryMethod === 'courier';
  if (order.status === 'rejected') return { key: 'rejected', label: 'Rejected' };
  if (order.status === 'cancelled') return { key: 'cancelled', label: 'Cancelled' };
  if (order.status === 'pending') return { key: 'pending', label: 'Pending' };


  if (order.status === 'completed') return { key: 'delivered', label: isPickup ? 'Picked Up' : 'Delivered' };



  if (isCourier) {
    return order.deliveryStatus === 'out_for_delivery'
      ? { key: 'on-the-way', label: 'Out for Delivery' }
      : { key: 'confirmed', label: 'Confirmed' };
  }
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





export function mapOrderRealtimeRow(row) {
  return {
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    productImageUrl: row.product_image_url || null,
    unit: row.unit,
    unitPrice: Number(row.unit_price),
    farmerId: row.farmer_id,
    farmerName: row.farmer_name,
    farmerAvatarUrl: row.farmer_avatar_url || null,
    farmerFarmName: row.farmer_farm_name || null,
    farmerVerificationStatus: row.farmer_verification_status || null,
    buyerId: row.buyer_id,
    buyerName: row.buyer_name,
    buyerAvatarUrl: row.buyer_avatar_url || null,
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
