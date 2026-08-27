import { apiClient } from './apiClient';

// Real Lalamove quotation, requested server-side (see backend/src/controllers/
// lalamove.controller.js — no Lalamove credentials or API calls ever happen in the browser).
// Used by CheckoutForm.jsx in place of the generic deliveryFeeService estimate when
// deliveryMethod === 'courier', since a courier fee should reflect Lalamove's own real price,
// not the road-distance fee formula farmer_delivery/buyer_pickup use.
export async function getLalamoveQuote(productId, deliveryMunicipality) {
  return apiClient.post('/lalamove/quote', { productId, deliveryMunicipality });
}
