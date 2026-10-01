import { apiClient } from './apiClient';






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



export async function getPublicFarmerProducts(farmerId) {
  return apiClient.get(`/products/public?farmerId=${farmerId}`);
}



export async function createProduct(values) {
  return apiClient.post('/products', values);
}





export async function getHistoricalPriceAnalysis(name, unit) {
  return apiClient.get(`/products/historical-price?name=${encodeURIComponent(name)}&unit=${encodeURIComponent(unit)}`);
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
