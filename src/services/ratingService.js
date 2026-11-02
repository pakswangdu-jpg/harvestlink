import { apiClient } from './apiClient';

export async function getRatingsForFarmer(farmerId) {
  return apiClient.get(`/ratings?farmerId=${farmerId}`);
}

export async function getRatingsForProduct(productId) {
  return apiClient.get(`/ratings?productId=${productId}`);
}

export async function getRatingForOrder(orderId) {
  const ratings = await apiClient.get(`/ratings?orderId=${orderId}`);
  return ratings[0] || null;
}




export async function createRating({ farmerId, productId, donationId, claimId, orderId, rating, comment, reviewImageUrl, reviewImageUrls, reviewVideoUrl }) {
  return apiClient.post('/ratings', { farmerId, productId, donationId, claimId, orderId, rating, comment, reviewImageUrl, reviewImageUrls, reviewVideoUrl });
}
