export const DUPLICATE_PRODUCT_ERROR_CODE = 'DUPLICATE_PRODUCT_LISTING';
export const DUPLICATE_PRODUCT_ERROR_TITLE = 'Product Listing Already Exists';
export const DUPLICATE_PRODUCT_ERROR_MESSAGE = 'A product listing with the same details already exists in your inventory. Please update the existing listing instead of creating a duplicate.';

export function normalizeProductName(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function normalizeOptionalField(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function normalizeExpirationDateKey(value) {
  if (!value) return '';
  const trimmed = String(value).trim();
  if (!trimmed) return '';
  return trimmed.slice(0, 10);
}

export function normalizeSalesType(value) {
  return String(value ?? '').trim().toLowerCase() === 'wholesale' ? 'wholesale' : 'retail';
}

export function buildProductDuplicateKey(product) {
  if (!product) return '';
  return JSON.stringify([
    normalizeProductName(product.name),
    normalizeOptionalField(product.variety),
    normalizeOptionalField(product.grade || 'A'),
    normalizeSalesType(product.sellingType ?? product.selling_type),
    normalizeOptionalField(product.unit),
    normalizeExpirationDateKey(product.expirationDate ?? product.expiration_date),
  ]);
}

export function findDuplicateActiveProduct(existingProducts, candidate, excludeId = null) {
  if (!Array.isArray(existingProducts) || !candidate) return null;
  const candidateKey = buildProductDuplicateKey(candidate);
  if (!candidateKey) return null;

  return existingProducts.find((item) => {
    if (!item) return false;
    if (excludeId && item.id === excludeId) return false;
    if (item.status !== 'active') return false;
    return buildProductDuplicateKey(item) === candidateKey;
  }) || null;
}
