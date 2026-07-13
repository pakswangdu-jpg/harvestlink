import { apiClient } from './apiClient';

// Every function here now talks to the real backend instead of localStorage — see
// backend/src/routes/products.routes.js for the matching API surface. The DTI
// fair-pricing check (buildPriceReview) now runs server-side (backend/src/lib/priceReview.js)
// since a client could otherwise submit any price with a forged marketReference to dodge it.

export async function getProducts() {
  return apiClient.get('/products');
}

export async function getActiveProducts() {
  return apiClient.get('/products?activeOnly=true');
}

export async function getProductById(id) {
  return apiClient.get(`/products/${id}`);
}

export async function getProductsByFarmer(farmerId) {
  return apiClient.get(`/products?farmerId=${farmerId}`);
}

// `farmer` is no longer needed — the backend infers the owner from the authenticated
// session — but the parameter is kept so call sites don't need to change.
export async function createProduct(values) {
  return apiClient.post('/products', values);
}

export async function updateProduct(id, values) {
  return apiClient.patch(`/products/${id}`, values);
}

export async function deleteProduct(id) {
  return apiClient.delete(`/products/${id}`);
}

export async function setProductStatus(id, status) {
  return apiClient.patch(`/products/${id}/status`, { status });
}

export async function applyDiscount(id, percent) {
  return apiClient.post(`/products/${id}/discount`, { percent });
}

export async function removeDiscount(id) {
  return apiClient.delete(`/products/${id}/discount`);
}

export async function getPendingPriceReviews() {
  return apiClient.get('/products/price-reviews/pending');
}

export async function getDeclinedPriceReviews() {
  return apiClient.get('/products/price-reviews/declined');
}

export async function approvePriceReview(id) {
  return apiClient.post(`/products/${id}/price-review/approve`);
}

export async function declinePriceReview(id) {
  return apiClient.post(`/products/${id}/price-review/decline`);
}

export async function reactivatePriceReview(id) {
  return apiClient.post(`/products/${id}/price-review/reactivate`);
}
