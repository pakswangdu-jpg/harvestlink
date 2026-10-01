import { apiClient } from './apiClient';

export async function getRatingsForFarmer(farmerId) {
  return apiClient.get(`/ratings?farmerId=${farmerId}`);
}

export async function getRatingForOrder(orderId) {
  const ratings = await apiClient.get(`/ratings?orderId=${orderId}`);
  return ratings[0] || null;
}




export async function createRating({ farmerId, orderId, rating, comment }) {
  return apiClient.post('/ratings', { farmerId, orderId, rating, comment });
}
