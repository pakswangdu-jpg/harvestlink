import { apiClient } from './apiClient';

// Smart Distance-Based Delivery Fee System — live checkout preview only (see
// backend/src/controllers/deliveryFee.controller.js). The order's actual, charged fee is
// always recomputed independently by the backend at order creation (createOrder in
// orders.controller.js), so this call can never itself put a manipulated fee on an order —
// it only drives what the checkout summary displays before the buyer submits.
// buyerLat/buyerLng are optional — only meaningful for deliveryMethod: 'buyer_pickup', where
// they're the buyer's real-time browser geolocation (see CheckoutForm.jsx) used to show real
// distance from wherever they actually are, not a fee (pickup is always free).
export async function getDeliveryFeeEstimate({
  originMunicipality, deliveryMunicipality, deliveryMethod, buyerLat, buyerLng,
}) {
  const params = new URLSearchParams({ originMunicipality, deliveryMethod });
  if (deliveryMunicipality) params.set('deliveryMunicipality', deliveryMunicipality);
  if (buyerLat != null) params.set('buyerLat', String(buyerLat));
  if (buyerLng != null) params.set('buyerLng', String(buyerLng));
  return apiClient.get(`/delivery-fee/estimate?${params.toString()}`);
}
