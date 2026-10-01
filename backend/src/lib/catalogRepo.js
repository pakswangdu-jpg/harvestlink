import { supabaseAdmin } from './supabaseClient.js';









const CACHE_TTL_MS = 60 * 1000;
let cache = null;
let cachedAt = 0;

export function invalidateCatalogCache() {
  cache = null;
}





export function unitStorageValue(unit) {
  return unit.abbreviation || unit.name.toLowerCase();
}



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
