import { supabaseAdmin } from '../lib/supabaseClient.js';
import { ApiError } from '../lib/ApiError.js';
import { getCatalog, invalidateCatalogCache, unitStorageValue } from '../lib/catalogRepo.js';

const DUPLICATE_ERROR_CODE = '23505';

function duplicateOr(error, message) {
  return new ApiError(error.code === DUPLICATE_ERROR_CODE ? message : error.message, 400);
}

// GET /api/catalog?includeInactive=true — the single source of truth for the whole app's
// Category -> Product -> Unit taxonomy (see supabase/schema.sql). Any signed-in role can
// read it; only an admin requesting includeInactive sees deactivated rows, since those exist
// purely for the admin management screen to restore later.
export async function getCatalogHandler(req, res) {
  const includeInactive = req.profile.role === 'admin' && req.query.includeInactive === 'true';
  res.json(await getCatalog({ includeInactive }));
}

// ---- Categories -------------------------------------------------------------------------

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
  res.status(201).json({ id: data.id, name: data.name, sortOrder: data.sort_order, isActive: data.is_active, products: [] });
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

// Hard delete — safe because products.category is plain text, never a foreign key to this
// table, so removing a category can't orphan or break an existing product listing. Cascades
// to that category's catalog products (and their unit associations) automatically.
export async function deleteCategory(req, res) {
  const { error } = await supabaseAdmin.from('categories').delete().eq('id', req.params.categoryId);
  if (error) throw new ApiError(error.message, 400);

  invalidateCatalogCache();
  res.status(204).end();
}

// ---- Catalog products ---------------------------------------------------------------------

export async function createProduct(req, res) {
  const name = String(req.body.name || '').trim();
  if (!name) throw new ApiError('Product name is required.', 400);

  const { data, error } = await supabaseAdmin
    .from('products_catalog')
    .insert({ category_id: req.params.categoryId, name, sort_order: Number(req.body.sortOrder) || 0 })
    .select()
    .single();
  if (error) throw duplicateOr(error, 'This product already exists in this category.');

  invalidateCatalogCache();
  res.status(201).json({ id: data.id, name: data.name, sortOrder: data.sort_order, isActive: data.is_active, units: [] });
}

export async function updateProduct(req, res) {
  const row = {};
  if (req.body.name !== undefined) row.name = String(req.body.name).trim();
  if (req.body.sortOrder !== undefined) row.sort_order = Number(req.body.sortOrder) || 0;
  if (req.body.isActive !== undefined) row.is_active = Boolean(req.body.isActive);

  const { data, error } = await supabaseAdmin.from('products_catalog').update(row).eq('id', req.params.productId).select().single();
  if (error) throw duplicateOr(error, 'This product already exists in this category.');
  if (!data) throw new ApiError('Product was not found.', 404);

  invalidateCatalogCache();
  res.json({ id: data.id, name: data.name, sortOrder: data.sort_order, isActive: data.is_active });
}

// Safe for the same reason as deleteCategory — products.name is plain text, so removing a
// catalog entry can't orphan an existing farmer listing. Cascades to its unit associations.
export async function deleteProduct(req, res) {
  const { error } = await supabaseAdmin.from('products_catalog').delete().eq('id', req.params.productId);
  if (error) throw new ApiError(error.message, 400);

  invalidateCatalogCache();
  res.status(204).end();
}

// ---- Units (master list) -------------------------------------------------------------------

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

// Cascades to every product_units row referencing this unit — a deliberate, admin-only
// action (removing "Sack" as a concept removes it from every product that used it), unlike
// deleteCategory/deleteProduct which are always safe because nothing else references them.
export async function deleteUnit(req, res) {
  const { error } = await supabaseAdmin.from('units').delete().eq('id', req.params.unitId);
  if (error) throw new ApiError(error.message, 400);

  invalidateCatalogCache();
  res.status(204).end();
}

// ---- Product <-> unit associations ---------------------------------------------------------

// Only one unit can be the default per product (enforced by a partial unique index — see
// supabase/schema.sql) — clearing any existing default first keeps that invariant true from
// the application side too, so the DB constraint is a backstop, not the only guard.
async function clearExistingDefault(productId) {
  await supabaseAdmin.from('product_units').update({ is_default: false }).eq('product_id', productId).eq('is_default', true);
}

export async function addProductUnit(req, res) {
  const { productId } = req.params;
  const unitId = req.body.unitId;
  if (!unitId) throw new ApiError('unitId is required.', 400);
  const isDefault = Boolean(req.body.isDefault);

  if (isDefault) await clearExistingDefault(productId);

  const { data, error } = await supabaseAdmin
    .from('product_units')
    .insert({ product_id: productId, unit_id: unitId, is_default: isDefault, sort_order: Number(req.body.sortOrder) || 0 })
    .select()
    .single();
  if (error) throw duplicateOr(error, 'This unit is already attached to this product.');

  invalidateCatalogCache();
  res.status(201).json({ unitId: data.unit_id, isDefault: data.is_default, sortOrder: data.sort_order });
}

export async function updateProductUnit(req, res) {
  const { productId, unitId } = req.params;
  const row = {};
  if (req.body.sortOrder !== undefined) row.sort_order = Number(req.body.sortOrder) || 0;
  if (req.body.isDefault !== undefined) {
    row.is_default = Boolean(req.body.isDefault);
    if (row.is_default) await clearExistingDefault(productId);
  }

  const { data, error } = await supabaseAdmin
    .from('product_units')
    .update(row)
    .eq('product_id', productId)
    .eq('unit_id', unitId)
    .select()
    .single();
  if (error) throw new ApiError(error.message, 400);
  if (!data) throw new ApiError('This unit is not attached to this product.', 404);

  invalidateCatalogCache();
  res.json({ unitId: data.unit_id, isDefault: data.is_default, sortOrder: data.sort_order });
}

export async function removeProductUnit(req, res) {
  const { error } = await supabaseAdmin
    .from('product_units')
    .delete()
    .eq('product_id', req.params.productId)
    .eq('unit_id', req.params.unitId);
  if (error) throw new ApiError(error.message, 400);

  invalidateCatalogCache();
  res.status(204).end();
}
