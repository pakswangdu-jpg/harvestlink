import { apiClient } from './apiClient';






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

export function createUnit({ name, abbreviation }) {
  return apiClient.post('/catalog/units', { name, abbreviation });
}

export function updateUnit(unitId, updates) {
  return apiClient.patch(`/catalog/units/${unitId}`, updates);
}

export function deleteUnit(unitId) {
  return apiClient.delete(`/catalog/units/${unitId}`);
}
