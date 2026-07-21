import { apiClient } from './apiClient';

// The Category -> Product -> Unit catalog is admin-editable data in Supabase (see
// backend/src/controllers/catalog.controller.js and supabase/schema.sql) — this is the only
// place in the frontend that talks to that endpoint. Everything else (ProductForm,
// Marketplace, FarmerProducts, FarmerDemandForecast, the admin Catalog screen) reads it
// through src/contexts/CatalogContext.jsx's useCatalog() hook instead of calling this directly.
export function getCatalog({ includeInactive = false } = {}) {
  return apiClient.get(`/catalog${includeInactive ? '?includeInactive=true' : ''}`);
}

export function createCategory({ name, sortOrder }) {
  return apiClient.post('/catalog/categories', { name, sortOrder });
}

export function updateCategory(categoryId, updates) {
  return apiClient.patch(`/catalog/categories/${categoryId}`, updates);
}

export function deleteCategory(categoryId) {
  return apiClient.delete(`/catalog/categories/${categoryId}`);
}

export function createCatalogProduct(categoryId, { name, sortOrder }) {
  return apiClient.post(`/catalog/categories/${categoryId}/products`, { name, sortOrder });
}

export function updateCatalogProduct(productId, updates) {
  return apiClient.patch(`/catalog/products/${productId}`, updates);
}

export function deleteCatalogProduct(productId) {
  return apiClient.delete(`/catalog/products/${productId}`);
}

export function createUnit({ name, abbreviation }) {
  return apiClient.post('/catalog/units', { name, abbreviation });
}

export function updateUnit(unitId, updates) {
  return apiClient.patch(`/catalog/units/${unitId}`, updates);
}

export function deleteUnit(unitId) {
  return apiClient.delete(`/catalog/units/${unitId}`);
}

export function addProductUnit(productId, { unitId, isDefault, sortOrder }) {
  return apiClient.post(`/catalog/products/${productId}/units`, { unitId, isDefault, sortOrder });
}

export function updateProductUnit(productId, unitId, updates) {
  return apiClient.patch(`/catalog/products/${productId}/units/${unitId}`, updates);
}

export function removeProductUnit(productId, unitId) {
  return apiClient.delete(`/catalog/products/${productId}/units/${unitId}`);
}
