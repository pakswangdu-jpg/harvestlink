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
    commodityResult,
  ] = await Promise.all([
    supabaseAdmin.from('categories').select('*').order('sort_order').order('name'),
    supabaseAdmin.from('units').select('*').order('name'),
    (() => {
      let query = supabaseAdmin.from('commodity_catalog').select('*, categories(name)').order('name');
      if (!includeInactive) query = query.eq('is_active', true);
      return query;
    })(),
  ]);
  if (categoryError) throw categoryError;
  if (unitError) throw unitError;
  if (commodityResult.error) throw commodityResult.error;

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
    commodities: (commodityResult.data || []).map((commodity) => ({
      id: commodity.id,
      name: commodity.name,
      variety: commodity.variety,
      label: [commodity.name, commodity.variety].filter(Boolean).join(' '),
      category: commodity.categories?.name || '',
      unit: commodity.unit,
      description: commodity.description,
      isActive: commodity.is_active,
    })),
  };

  if (!includeInactive) {
    cache = result;
    cachedAt = Date.now();
  }
  return result;
}
