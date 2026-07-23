import { supabaseAdmin } from '../lib/supabaseClient.js';
import { serializeProduct } from '../lib/serialize.js';
import { buildPriceReview, resolveKgPerUnit } from '../lib/priceReview.js';
import { ApiError } from '../lib/ApiError.js';
import { getCatalog } from '../lib/catalogRepo.js';

// The product name is free text (see ProductForm.jsx) — title-casing it here keeps listings
// consistent ("Cabbage" not "cabbage") regardless of how the farmer typed it, matching the
// same normalization already used for crop names in forecast.controller.js.
function titleCaseName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

// Validates category/unit against the live categories/units tables (see
// supabase/schema.sql) — the source of truth that replaced the old hardcoded
// PRODUCT_CATEGORIES array. The product NAME itself is free text (see ProductForm.jsx),
// not picked from a catalog, so there's nothing to validate it against here. Units are the
// flat master list, not scoped per-product (products_catalog/product_units were removed).
//
// `existing` (an in-flight update's current row) is optional: when present, a category/unit
// that matches what's ALREADY saved on this product is always accepted even if that
// category has since been renamed/deactivated, so editing an unrelated field (price,
// quantity, description) on an older listing never breaks — only actually CHANGING to a new
// category/unit is checked against the current catalog.
async function assertValidCategoryAndUnit(values, existing) {
  const catalog = await getCatalog();
  const category = catalog.categories.find((entry) => entry.name === values.category);
  const categoryUnchanged = Boolean(existing) && values.category === existing.category;
  if (!category && !categoryUnchanged) throw new ApiError('Choose a valid category.', 400);

  const allowedUnitValues = catalog.units.map((unit) => unit.value);
  const unitUnchanged = Boolean(existing) && values.unit === existing.unit;
  if (!allowedUnitValues.includes(values.unit) && !unitUnchanged) {
    throw new ApiError('Choose a valid unit.', 400);
  }
}

// Batch-resolves farmer names for a list of products in one query, instead of joining —
// keeps products a lean table (see supabase/schema.sql) while still returning the flat
// farmerName field every frontend component already expects.
async function withFarmerNames(rows) {
  const farmerIds = [...new Set(rows.map((row) => row.farmer_id))];
  if (!farmerIds.length) return rows.map((row) => serializeProduct(row));

  const { data: farmers } = await supabaseAdmin.from('profiles').select('id, name').in('id', farmerIds);
  const nameById = new Map((farmers || []).map((farmer) => [farmer.id, farmer.name]));
  return rows.map((row) => serializeProduct(row, nameById.get(row.farmer_id) || null));
}

async function fetchProductOr404(id) {
  const { data, error } = await supabaseAdmin.from('products').select('*').eq('id', id).single();
  if (error || !data) throw new ApiError('Product was not found.', 404);
  return data;
}

function assertOwnership(req, product) {
  if (req.profile.role !== 'farmer' || req.profile.id !== product.farmer_id) {
    throw new ApiError('You do not have permission to modify this product.', 403);
  }
}

export async function listProducts(req, res) {
  let query = supabaseAdmin.from('products').select('*').order('created_at', { ascending: false });
  if (req.query.status) query = query.eq('status', req.query.status);
  if (req.query.farmerId) query = query.eq('farmer_id', req.query.farmerId);
  if (req.query.activeOnly === 'true') {
    query = query.eq('status', 'active').gt('quantity', 0);
    // A flagged price (see buildPriceReview) leaves status as 'active' so the farmer can
    // still see/manage the listing while it's under review — but it must stay invisible to
    // buyers until DTI/admin actually approves it, not just because the record is "active".
    query = query.or('price_review.is.null,price_review->>status.eq.approved');
  }

  const { data, error } = await query;
  if (error) throw new ApiError(error.message, 400);
  res.json(await withFarmerNames(data));
}

// GET /api/products/public?farmerId=... — public, no auth. Backs the same signed-out
// "view farmer" page as getPublicFarmerProfile — only that farmer's active, in-stock,
// non-flagged listings (same activeOnly gate listProducts applies for logged-in buyers),
// with cost_price/price_review stripped out. The authenticated marketplace already returns
// those two to any logged-in buyer, but there's no reason to hand a farmer's cost basis and
// DTI review state to an anonymous visitor who isn't even a customer yet.
export async function listPublicProducts(req, res) {
  const { farmerId } = req.query;
  if (!farmerId) throw new ApiError('farmerId is required.', 400);

  const { data, error } = await supabaseAdmin
    .from('products')
    .select('*')
    .eq('farmer_id', farmerId)
    .eq('status', 'active')
    .gt('quantity', 0)
    .or('price_review.is.null,price_review->>status.eq.approved')
    .order('created_at', { ascending: false });
  if (error) throw new ApiError(error.message, 400);

  const serialized = await withFarmerNames(data);
  // An allowlist, not a denylist — costPrice/priceReview are simply never picked, so a
  // future field added to serializeProduct doesn't leak here by default.
  res.json(serialized.map((product) => ({
    id: product.id,
    farmerId: product.farmerId,
    farmerName: product.farmerName,
    name: product.name,
    category: product.category,
    grade: product.grade,
    sellingType: product.sellingType,
    moq: product.moq,
    price: product.price,
    unit: product.unit,
    kgPerUnit: product.kgPerUnit,
    quantity: product.quantity,
    location: product.location,
    description: product.description,
    image: product.image,
    status: product.status,
    originalPrice: product.originalPrice,
    discountPercent: product.discountPercent,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  })));
}

export async function getProduct(req, res) {
  const product = await fetchProductOr404(req.params.id);
  const [serialized] = await withFarmerNames([product]);
  res.json(serialized);
}

export async function createProduct(req, res) {
  const values = req.body;
  await assertValidCategoryAndUnit(values);

  const kgPerUnit = resolveKgPerUnit(values.unit, values.kgPerUnit);
  const now = new Date().toISOString();
  const row = {
    farmer_id: req.profile.id,
    name: titleCaseName(values.name),
    category: values.category,
    grade: values.grade || 'A',
    selling_type: values.sellingType || 'retail',
    moq: values.sellingType === 'wholesale' ? Number(values.moq) : null,
    price: Number(values.price),
    unit: values.unit,
    kg_per_unit: values.unit === 'kg' ? null : kgPerUnit,
    quantity: Number(values.quantity),
    location: values.location.trim(),
    description: values.description?.trim() || '',
    image_url: values.image || null,
    status: 'active',
    price_review: buildPriceReview(values.marketReference, values.price, null, kgPerUnit),
    cost_price: values.costPrice ? Number(values.costPrice) : null,
    expiration_date: values.expirationDate || null,
    created_at: now,
    updated_at: now,
  };

  const { data, error } = await supabaseAdmin.from('products').insert(row).select().single();
  if (error) throw new ApiError(error.message, 400);
  const [serialized] = await withFarmerNames([data]);
  res.status(201).json(serialized);
}

export async function updateProduct(req, res) {
  const existing = await fetchProductOr404(req.params.id);
  assertOwnership(req, existing);

  const values = req.body;
  const unit = values.unit ?? existing.unit;
  const category = values.category ?? existing.category;
  await assertValidCategoryAndUnit({ category, unit }, existing);

  const kgPerUnit = resolveKgPerUnit(unit, values.kgPerUnit ?? existing.kg_per_unit);
  const price = values.price !== undefined ? Number(values.price) : Number(existing.price);
  const quantity = values.quantity !== undefined ? Number(values.quantity) : Number(existing.quantity);
  const sellingType = values.sellingType ?? existing.selling_type;

  const priceReview = values.marketReference !== undefined
    ? buildPriceReview(values.marketReference, price, existing.price_review, kgPerUnit)
    : existing.price_review;

  const row = {
    name: values.name !== undefined ? titleCaseName(values.name) : existing.name,
    category,
    grade: values.grade ?? existing.grade,
    selling_type: sellingType,
    moq: sellingType === 'wholesale' ? Number(values.moq ?? existing.moq) : null,
    price,
    unit,
    kg_per_unit: unit === 'kg' ? null : kgPerUnit,
    quantity,
    location: values.location?.trim() ?? existing.location,
    description: values.description?.trim() ?? existing.description,
    image_url: values.image !== undefined ? values.image || null : existing.image_url,
    status: values.status || (quantity > 0 ? existing.status : 'inactive'),
    price_review: priceReview,
    cost_price: values.costPrice !== undefined ? (values.costPrice ? Number(values.costPrice) : null) : existing.cost_price,
    expiration_date: values.expirationDate !== undefined ? (values.expirationDate || null) : existing.expiration_date,
  };

  const { data, error } = await supabaseAdmin.from('products').update(row).eq('id', existing.id).select().single();
  if (error) throw new ApiError(error.message, 400);
  const [serialized] = await withFarmerNames([data]);
  res.json(serialized);
}

export async function deleteProduct(req, res) {
  const existing = await fetchProductOr404(req.params.id);
  assertOwnership(req, existing);
  const { error } = await supabaseAdmin.from('products').delete().eq('id', existing.id);
  if (error) throw new ApiError(error.message, 400);
  res.status(204).end();
}

export async function setProductStatus(req, res) {
  const existing = await fetchProductOr404(req.params.id);
  assertOwnership(req, existing);
  const { status } = req.body;

  if (status === 'active') {
    if (Number(existing.quantity) <= 0) throw new ApiError('This product has no remaining stock — add stock before activating it.', 400);
    if (existing.price_review?.status === 'declined') {
      throw new ApiError('DTI declined this price — edit the product with a new price before activating it.', 400);
    }
  }

  const { data, error } = await supabaseAdmin.from('products').update({ status }).eq('id', existing.id).select().single();
  if (error) throw new ApiError(error.message, 400);
  const [serialized] = await withFarmerNames([data]);
  res.json(serialized);
}

export async function applyDiscount(req, res) {
  const existing = await fetchProductOr404(req.params.id);
  assertOwnership(req, existing);
  const percent = Number(req.body.percent);
  if (!Number.isFinite(percent) || percent <= 0 || percent >= 100) {
    throw new ApiError('Discount percent must be between 1 and 99.', 400);
  }

  const originalPrice = existing.original_price ?? existing.price;
  const discountedPrice = Number((originalPrice * (1 - percent / 100)).toFixed(2));

  const { data, error } = await supabaseAdmin
    .from('products')
    .update({ original_price: originalPrice, discount_percent: percent, price: discountedPrice })
    .eq('id', existing.id)
    .select()
    .single();
  if (error) throw new ApiError(error.message, 400);
  const [serialized] = await withFarmerNames([data]);
  res.json(serialized);
}

export async function removeDiscount(req, res) {
  const existing = await fetchProductOr404(req.params.id);
  assertOwnership(req, existing);
  if (!existing.original_price) {
    const [serialized] = await withFarmerNames([existing]);
    return res.json(serialized);
  }

  const { data, error } = await supabaseAdmin
    .from('products')
    .update({ price: existing.original_price, original_price: null, discount_percent: null })
    .eq('id', existing.id)
    .select()
    .single();
  if (error) throw new ApiError(error.message, 400);
  const [serialized] = await withFarmerNames([data]);
  res.json(serialized);
}

// Internal helpers (not routes) — called directly by orders.controller.js when an order
// is confirmed/cancelled, exactly mirroring how the old orderService.js called
// reduceProductQuantity/restoreProductQuantity from productService.js in-process.
export async function reduceProductQuantity(id, quantity) {
  const product = await fetchProductOr404(id);
  const nextQuantity = Number(product.quantity) - Number(quantity);
  if (nextQuantity < 0) throw new ApiError('Requested quantity exceeds available stock.', 400);

  const { error } = await supabaseAdmin
    .from('products')
    .update({ quantity: nextQuantity, status: nextQuantity > 0 ? product.status : 'inactive' })
    .eq('id', id);
  if (error) throw new ApiError(error.message, 400);
}

export async function restoreProductQuantity(id, quantity) {
  const { data: product } = await supabaseAdmin.from('products').select('*').eq('id', id).single();
  if (!product) return;

  const nextQuantity = Number(product.quantity) + Number(quantity);
  const wasAutoDeactivated = product.status === 'inactive' && Number(product.quantity) === 0;
  const isDeclined = product.price_review?.status === 'declined';
  const shouldReactivate = wasAutoDeactivated && !isDeclined && nextQuantity > 0;

  await supabaseAdmin
    .from('products')
    .update({ quantity: nextQuantity, status: shouldReactivate ? 'active' : product.status })
    .eq('id', id);
}

export async function getPendingPriceReviews(req, res) {
  const { data, error } = await supabaseAdmin.from('products').select('*').eq('price_review->>status', 'pending');
  if (error) throw new ApiError(error.message, 400);
  res.json(await withFarmerNames(data));
}

export async function getDeclinedPriceReviews(req, res) {
  const { data, error } = await supabaseAdmin.from('products').select('*').eq('price_review->>status', 'declined');
  if (error) throw new ApiError(error.message, 400);
  res.json(await withFarmerNames(data));
}

export async function approvePriceReview(req, res) {
  const existing = await fetchProductOr404(req.params.id);
  if (!existing.price_review) throw new ApiError('This product has no pending price review.', 400);

  const { data, error } = await supabaseAdmin
    .from('products')
    .update({ price_review: { ...existing.price_review, status: 'approved', decidedAt: new Date().toISOString() } })
    .eq('id', existing.id)
    .select()
    .single();
  if (error) throw new ApiError(error.message, 400);
  const [serialized] = await withFarmerNames([data]);
  res.json(serialized);
}

export async function declinePriceReview(req, res) {
  const existing = await fetchProductOr404(req.params.id);
  if (!existing.price_review) throw new ApiError('This product has no pending price review.', 400);

  const { data, error } = await supabaseAdmin
    .from('products')
    .update({
      status: 'inactive',
      price_review: { ...existing.price_review, status: 'declined', decidedAt: new Date().toISOString() },
    })
    .eq('id', existing.id)
    .select()
    .single();
  if (error) throw new ApiError(error.message, 400);
  const [serialized] = await withFarmerNames([data]);
  res.json(serialized);
}

export async function reactivatePriceReview(req, res) {
  const existing = await fetchProductOr404(req.params.id);
  if (existing.price_review?.status !== 'declined') throw new ApiError('This product does not have a declined price review.', 400);
  if (Number(existing.quantity) <= 0) throw new ApiError('This product has no remaining stock — add stock before reactivating it.', 400);

  const { data, error } = await supabaseAdmin
    .from('products')
    .update({
      status: 'active',
      price_review: { ...existing.price_review, status: 'approved', decidedAt: new Date().toISOString() },
    })
    .eq('id', existing.id)
    .select()
    .single();
  if (error) throw new ApiError(error.message, 400);
  const [serialized] = await withFarmerNames([data]);
  res.json(serialized);
}
