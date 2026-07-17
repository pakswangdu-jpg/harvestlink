import { apiClient } from './apiClient';

export async function getRatingsForFarmer(farmerId) {
  return apiClient.get(`/ratings?farmerId=${farmerId}`);
}

export async function getRatingForOrder(orderId) {
  const ratings = await apiClient.get(`/ratings?orderId=${orderId}`);
  return ratings[0] || null;
}

// `orderId` is omitted entirely (not sent as null/undefined) for a stakeholder rating a
// donation — there's no backend order behind a donation (see donationService.js), so the
// backend treats a missing orderId as "this must be a stakeholder confirming a donation".
export async function createRating({ farmerId, orderId, rating, comment }) {
  return apiClient.post('/ratings', { farmerId, orderId, rating, comment });
}
