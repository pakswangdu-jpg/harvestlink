import { apiClient } from './apiClient';

// Smart Distance-Based Delivery Fee System — live checkout preview only (see
// backend/src/controllers/deliveryFee.controller.js). The order's actual, charged fee is
// always recomputed independently by the backend at order creation (createOrder in
// orders.controller.js), so this call can never itself put a manipulated fee on an order —
// it only drives what the checkout summary displays before the buyer submits.
export async function getDeliveryFeeEstimate({ originMunicipality, deliveryMunicipality, deliveryMethod }) {
  const params = new URLSearchParams({ originMunicipality, deliveryMethod });
  if (deliveryMunicipality) params.set('deliveryMunicipality', deliveryMunicipality);
  return apiClient.get(`/delivery-fee/estimate?${params.toString()}`);
}
