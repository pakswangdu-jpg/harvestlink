import { apiClient } from './apiClient';

export const getDonations = () => apiClient.get('/donations');
export const getDonationById = (id) => apiClient.get(`/donations/${encodeURIComponent(id)}`);
export const getAvailableDonations = () => apiClient.get('/donations?status=available');
export const getDonationsByFarmer = (id) => apiClient.get(`/donations?farmerId=${encodeURIComponent(id)}`);
export const getDonationsForStakeholder = (id) => apiClient.get(`/donations?stakeholderId=${encodeURIComponent(id)}`);
export const createDonation = (product) => apiClient.post('/donations', { productId: product.id });

const act = (id, action, values = {}) => apiClient.post(`/donations/${encodeURIComponent(id)}/${action}`, values);
export const requestDonation = (id) => act(id, 'request');
export const declineDonationRequest = (id) => act(id, 'decline');
export const acceptDonationRequest = (id, pickupDate) => act(id, 'schedule', { pickupDate });
export const confirmReceipt = (id) => act(id, 'receive');
export const markDonationRated = (id) => act(id, 'rate');
export const cancelDonation = (id) => act(id, 'cancel');
