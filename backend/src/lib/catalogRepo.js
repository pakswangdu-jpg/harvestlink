import { supabaseAdmin } from './supabaseClient.js';

// Real category/unit data from Supabase (public.categories / public.units) — the single
// source of truth that replaced the earlier hardcoded PRODUCT_CATEGORIES array and, before
// that, the flat crop_categories/crops tables. The product NAME itself is free text on the
// Product Listing form (see ProductForm.jsx), not picked from a category-scoped catalog —
// products_catalog/product_units were removed as a curated per-crop catalog turned out more
// rigid than useful in practice. Cached briefly since every product create/update and every
// GET /api/catalog call would otherwise re-query both tables on every request; invalidated
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

// { categories: [{ id, name, sortOrder, isActive }], units: [{ id, name, abbreviation, value }] }
// — `units` is the flat master list every product listing picks from, regardless of category.
export async function getCatalog({ includeInactive = false } = {}) {
  if (!includeInactive && cache && Date.now() - cachedAt < CACHE_TTL_MS) return cache;

  const [
    { data: categoryRows, error: categoryError },
    { data: unitRows, error: unitError },
  ] = await Promise.all([
    supabaseAdmin.from('categories').select('*').order('sort_order').order('name'),
    supabaseAdmin.from('units').select('*').order('name'),
  ]);
  if (categoryError) throw categoryError;
  if (unitError) throw unitError;

  const categories = categoryRows
    .filter((category) => includeInactive || category.is_active)
    .map((category) => ({
      id: category.id,
      name: category.name,
      sortOrder: category.sort_order,
      isActive: category.is_active,
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
