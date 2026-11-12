import { apiClient } from './apiClient';

export const getDonations = () => apiClient.get('/donations');
export const getAdminDonationPage = (filters) => apiClient.get(`/donations?${new URLSearchParams(filters)}`);
export const getDonationById = (id) => apiClient.get(`/donations/${encodeURIComponent(id)}`);
export const getAvailableDonations = () => apiClient.get('/donations?status=available');
export const getDonationsByFarmer = (id) => apiClient.get(`/donations?farmerId=${encodeURIComponent(id)}`);
export const getDonationsForStakeholder = (id) => apiClient.get(`/donations?stakeholderId=${encodeURIComponent(id)}`);
export const createDonation = (product, expirationAt) => apiClient.post('/donations', {
  productId: product.id,
  ...(typeof expirationAt === 'string' ? { expirationAt } : {}),
});

const act = (id, action, values = {}) => apiClient.post(`/donations/${encodeURIComponent(id)}/${action}`, values);
export const requestDonation = (id, quantity) => {
  const amount = Number(quantity);
  if (quantity == null || (typeof quantity === 'string' && !quantity.trim()) || !Number.isFinite(amount) || amount <= 0) {
    throw new Error('Enter a positive donation quantity.');
  }
  return apiClient.post(`/donations/${encodeURIComponent(id)}/claims`, { quantity: amount });
};
export const declineDonationRequest = (id) => act(id, 'decline');
export const acceptDonationRequest = (id, pickupDate) => act(id, 'schedule', { pickupDate });
export const confirmReceipt = (id) => act(id, 'receive');
export const markDonationRated = (id) => act(id, 'rate');
export const cancelDonation = (id) => act(id, 'cancel');

export const scheduleDonationClaim = (id, pickupDate) => apiClient.post(`/donations/claims/${encodeURIComponent(id)}/schedule`, { pickupDate });
export const rejectDonationClaim = (id) => apiClient.post(`/donations/claims/${encodeURIComponent(id)}/reject`, {});
export const cancelDonationClaim = (id) => apiClient.post(`/donations/claims/${encodeURIComponent(id)}/cancel`, {});
export const receiveDonationClaim = (id) => apiClient.post(`/donations/claims/${encodeURIComponent(id)}/receive`, {});
export const markDonationClaimRated = (id) => apiClient.post(`/donations/claims/${encodeURIComponent(id)}/rate`, {});

export const getDonationTrackingProfiles = (id, claimId = null) =>
  claimId
    ? apiClient.get(`/donations/claims/${encodeURIComponent(claimId)}/tracking-profiles`)
    : apiClient.get(`/donations/${encodeURIComponent(id)}/tracking-profiles`);

export const updateDonationPickupLocation = (id, location, claimId = null) =>
  claimId
    ? apiClient.patch(`/donations/claims/${encodeURIComponent(claimId)}/location`, location)
    : apiClient.patch(`/donations/${encodeURIComponent(id)}/location`, location);

export const notifyFarmerOfDonationArrival = (id, claimId = null) =>
  claimId
    ? apiClient.post(`/donations/claims/${encodeURIComponent(claimId)}/notify-arrival`, {})
    : apiClient.post(`/donations/${encodeURIComponent(id)}/notify-arrival`, {});

export const confirmDonationHandover = (id, claimId = null) =>
  claimId
    ? apiClient.post(`/donations/claims/${encodeURIComponent(claimId)}/confirm-handover`, {})
    : apiClient.post(`/donations/${encodeURIComponent(id)}/confirm-handover`, {});
