import { apiClient } from './apiClient';






export async function getLalamoveQuote(productId, deliveryMunicipality) {
  return apiClient.post('/lalamove/quote', { productId, deliveryMunicipality });
}
