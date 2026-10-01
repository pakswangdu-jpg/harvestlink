import { supabaseAdmin } from '../lib/supabaseClient.js';
import { ApiError } from '../lib/ApiError.js';
import { getCatalog, invalidateCatalogCache, unitStorageValue } from '../lib/catalogRepo.js';

const DUPLICATE_ERROR_CODE = '23505';

function duplicateOr(error, message) {
  return new ApiError(error.code === DUPLICATE_ERROR_CODE ? message : error.message, 400);
}





export async function getCatalogHandler(req, res) {
  const includeInactive = req.profile.role === 'admin' && req.query.includeInactive === 'true';
  res.json(await getCatalog({ includeInactive }));
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
