import { supabaseAdmin } from '../lib/supabaseClient.js';
import { ApiError } from '../lib/ApiError.js';
import { getCatalog, invalidateCatalogCache, unitStorageValue } from '../lib/catalogRepo.js';
import { MARKET_COMMODITIES } from '../lib/marketCommodities.js';

const DUPLICATE_ERROR_CODE = '23505';

function normalizeCatalogValue(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function duplicateOr(error, message) {
  return new ApiError(error.code === DUPLICATE_ERROR_CODE ? message : error.message, 400);
}





export async function getCatalogHandler(req, res) {
  const includeInactive = req.profile.role === 'admin' && req.query.includeInactive === 'true';
  res.json(await getCatalog({ includeInactive }));
}

export async function createCommodity(req, res) {
  const name = String(req.body.name || '').trim().replace(/\s+/g, ' ');
  const variety = String(req.body.variety || '').trim().replace(/\s+/g, ' ') || null;
  const categoryName = String(req.body.category || '').trim();
  const unit = String(req.body.unit || '').trim();
  const description = String(req.body.description || '').trim() || null;
  const isActive = req.body.isActive === undefined ? true : req.body.isActive;

  if (!name || name.length > 100) throw new ApiError('Commodity name is required and must be under 100 characters.', 400);
  if (!categoryName) throw new ApiError('Choose a commodity category.', 400);
  if (!unit || unit.length > 30) throw new ApiError('Choose a valid unit of measurement.', 400);
  if (description && description.length > 500) throw new ApiError('Description cannot exceed 500 characters.', 400);
  if (typeof isActive !== 'boolean') throw new ApiError('Commodity status is invalid.', 400);

  const [{ data: category, error: categoryError }, { data: units, error: unitError }] = await Promise.all([
    supabaseAdmin.from('categories').select('id').eq('name', categoryName).eq('is_active', true).maybeSingle(),
    supabaseAdmin.from('units').select('name, abbreviation'),
  ]);
  if (categoryError) throw new ApiError(categoryError.message, 400);
  if (unitError) throw new ApiError(unitError.message, 400);
  const validUnit = units.find((entry) => unit === unitStorageValue(entry));
  if (!category) throw new ApiError('Choose an active commodity category.', 400);
  if (!validUnit) throw new ApiError('Choose a valid unit of measurement.', 400);
  const normalizedName = normalizeCatalogValue(name);
  const normalizedVariety = normalizeCatalogValue(variety);
  const normalizedUnit = normalizeCatalogValue(unit);
  if (normalizedUnit === 'kg' && !normalizedVariety
      && MARKET_COMMODITIES.some((commodity) => normalizeCatalogValue(commodity.label) === normalizedName)) {
    throw new ApiError('This commodity is already in the PSA catalog.', 409);
  }

  const { data, error } = await supabaseAdmin
    .from('commodity_catalog')
    .insert({
      name,
      name_normalized: normalizedName,
      variety,
      variety_normalized: normalizedVariety,
      category_id: category.id,
      unit,
      unit_normalized: normalizedUnit,
      description,
      is_active: isActive,
      created_by: req.profile.id,
    })
    .select('*, categories(name)')
    .single();
  if (error) {
    if (error.code === DUPLICATE_ERROR_CODE) {
      throw new ApiError('A commodity with this name, variety, and unit already exists.', 409);
    }
    throw new ApiError(error.message, 400);
  }

  invalidateCatalogCache();
  res.status(201).json({
    id: data.id,
    name: data.name,
    variety: data.variety,
    label: [data.name, data.variety].filter(Boolean).join(' '),
    category: data.categories?.name || categoryName,
    unit: data.unit,
    description: data.description,
    isActive: data.is_active,
  });
}

export async function createCategory(req, res) {
  const name = String(req.body.name || '').trim();
  if (!name) throw new ApiError('Category name is required.', 400);

  const { data, error } = await supabaseAdmin
    .from('categories')
    .insert({ name, sort_order: Number(req.body.sortOrder) || 0 })
    .select()
    .single();
  if (error) throw duplicateOr(error, 'A category with this name already exists.');

  invalidateCatalogCache();
  res.status(201).json({ id: data.id, name: data.name, sortOrder: data.sort_order, isActive: data.is_active });
}

export async function updateCategory(req, res) {
  const row = {};
  if (req.body.name !== undefined) row.name = String(req.body.name).trim();
  if (req.body.sortOrder !== undefined) row.sort_order = Number(req.body.sortOrder) || 0;
  if (req.body.isActive !== undefined) row.is_active = Boolean(req.body.isActive);

  const { data, error } = await supabaseAdmin.from('categories').update(row).eq('id', req.params.categoryId).select().single();
  if (error) throw duplicateOr(error, 'A category with this name already exists.');
  if (!data) throw new ApiError('Category was not found.', 404);

  invalidateCatalogCache();
  res.json({ id: data.id, name: data.name, sortOrder: data.sort_order, isActive: data.is_active });
}



export async function deleteCategory(req, res) {
  const { error } = await supabaseAdmin.from('categories').delete().eq('id', req.params.categoryId);
  if (error) throw new ApiError(error.message, 400);

  invalidateCatalogCache();
  res.status(204).end();
}



export async function createUnit(req, res) {
  const name = String(req.body.name || '').trim();
  if (!name) throw new ApiError('Unit name is required.', 400);
  const abbreviation = req.body.abbreviation ? String(req.body.abbreviation).trim() : null;

  const { data, error } = await supabaseAdmin.from('units').insert({ name, abbreviation }).select().single();
  if (error) throw duplicateOr(error, 'A unit with this name already exists.');

  invalidateCatalogCache();
  res.status(201).json({ id: data.id, name: data.name, abbreviation: data.abbreviation, value: unitStorageValue(data) });
}

export async function updateUnit(req, res) {
  const row = {};
  if (req.body.name !== undefined) row.name = String(req.body.name).trim();
  if (req.body.abbreviation !== undefined) row.abbreviation = req.body.abbreviation ? String(req.body.abbreviation).trim() : null;

  const { data, error } = await supabaseAdmin.from('units').update(row).eq('id', req.params.unitId).select().single();
  if (error) throw duplicateOr(error, 'A unit with this name already exists.');
  if (!data) throw new ApiError('Unit was not found.', 404);

  invalidateCatalogCache();
  res.json({ id: data.id, name: data.name, abbreviation: data.abbreviation, value: unitStorageValue(data) });
}


export async function deleteUnit(req, res) {
  const { error } = await supabaseAdmin.from('units').delete().eq('id', req.params.unitId);
  if (error) throw new ApiError(error.message, 400);

  invalidateCatalogCache();
  res.status(204).end();
}
