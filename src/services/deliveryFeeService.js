import { apiClient } from './apiClient';









export async function getDeliveryFeeEstimate({
  originMunicipality, deliveryMunicipality, deliveryMethod, buyerLat, buyerLng,
}) {
  const params = new URLSearchParams({ originMunicipality, deliveryMethod });
  if (deliveryMunicipality) params.set('deliveryMunicipality', deliveryMunicipality);
  if (buyerLat != null) params.set('buyerLat', String(buyerLat));
  if (buyerLng != null) params.set('buyerLng', String(buyerLng));
  return apiClient.get(`/delivery-fee/estimate?${params.toString()}`);
}
