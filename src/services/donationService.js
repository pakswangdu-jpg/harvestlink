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
export const requestDonation = (id, quantity) => Number.isFinite(Number(quantity))
  ? apiClient.post(`/donations/${encodeURIComponent(id)}/claims`, { quantity: Number(quantity) })
  : act(id, 'request');
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
