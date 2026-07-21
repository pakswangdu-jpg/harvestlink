import { supabaseAdmin } from './supabaseClient.js';

// Real category/product/unit data from Supabase (public.categories /
// public.products_catalog / public.units / public.product_units) — the single source of
// truth that replaced the earlier hardcoded PRODUCT_CATEGORIES array and, before that, the
// flat crop_categories/crops tables. Cached briefly since every product create/update and
// every GET /api/catalog call would otherwise re-query 4 tables on every request; invalidated
// immediately after any admin mutation (see catalog.controller.js).
const CACHE_TTL_MS = 60 * 1000;
let cache = null;
let cachedAt = 0;

export function invalidateCatalogCache() {
  cache = null;
}

// The actual string stored on products.unit — the abbreviation when the unit has one
// ("kg", "L", "dz"), otherwise its lowercased name ("bundle", "crate", "net bag") — matching
// the short, compact style every legacy unit value already used. Computed once here so the
// frontend never has to re-derive it and risk drifting from what the backend accepts.
export function unitStorageValue(unit) {
  return unit.abbreviation || unit.name.toLowerCase();
}

// { categories: [{ id, name, sortOrder, isActive, products: [{ id, name, sortOrder,
//   isActive, units: [{ id, name, abbreviation, isDefault, sortOrder }] }] }],
//   units: [{ id, name, abbreviation }] } — `units` is the flat master list (every unit that
// exists, whether or not it's attached to any product yet), used by the admin UI to attach a
// unit to a product without needing a separate request.
export async function getCatalog({ includeInactive = false } = {}) {
  if (!includeInactive && cache && Date.now() - cachedAt < CACHE_TTL_MS) return cache;

  const [
    { data: categoryRows, error: categoryError },
    { data: productRows, error: productError },
    { data: unitRows, error: unitError },
    { data: productUnitRows, error: productUnitError },
  ] = await Promise.all([
    supabaseAdmin.from('categories').select('*').order('sort_order').order('name'),
    supabaseAdmin.from('products_catalog').select('*').order('sort_order').order('name'),
    supabaseAdmin.from('units').select('*').order('name'),
    supabaseAdmin.from('product_units').select('*').order('sort_order'),
  ]);
  if (categoryError) throw categoryError;
  if (productError) throw productError;
  if (unitError) throw unitError;
  if (productUnitError) throw productUnitError;

  const unitById = new Map(unitRows.map((unit) => [unit.id, unit]));
  const unitsByProduct = new Map();
  productUnitRows.forEach((row) => {
    const unit = unitById.get(row.unit_id);
    if (!unit) return;
    if (!unitsByProduct.has(row.product_id)) unitsByProduct.set(row.product_id, []);
    unitsByProduct.get(row.product_id).push({
      id: unit.id,
      name: unit.name,
      abbreviation: unit.abbreviation,
      value: unitStorageValue(unit),
      isDefault: row.is_default,
      sortOrder: row.sort_order,
    });
  });

  const productsByCategory = new Map();
  productRows
    .filter((product) => includeInactive || product.is_active)
    .forEach((product) => {
      if (!productsByCategory.has(product.category_id)) productsByCategory.set(product.category_id, []);
      productsByCategory.get(product.category_id).push({
        id: product.id,
        name: product.name,
        sortOrder: product.sort_order,
        isActive: product.is_active,
        units: unitsByProduct.get(product.id) || [],
      });
    });

  const categories = categoryRows
    .filter((category) => includeInactive || category.is_active)
    .map((category) => ({
      id: category.id,
      name: category.name,
      sortOrder: category.sort_order,
      isActive: category.is_active,
      products: productsByCategory.get(category.id) || [],
    }));

  const result = {
    categories,
    units: unitRows.map((unit) => ({ id: unit.id, name: unit.name, abbreviation: unit.abbreviation, value: unitStorageValue(unit) })),
  };

  if (!includeInactive) {
    cache = result;
    cachedAt = Date.now();
  }
  return result;
}
