import { supabaseAdmin } from '../lib/supabaseClient.js';
import { serializeProduct } from '../lib/serialize.js';
import { buildPriceReview, resolveKgPerUnit } from '../lib/priceReview.js';
import { getUnitsForCategory, PRODUCT_CATEGORIES } from '../utils/constants.js';
import { ApiError } from '../lib/ApiError.js';

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
  if (req.query.activeOnly === 'true') query = query.eq('status', 'active').gt('quantity', 0);

  const { data, error } = await query;
  if (error) throw new ApiError(error.message, 400);
  res.json(await withFarmerNames(data));
}

export async function getProduct(req, res) {
  const product = await fetchProductOr404(req.params.id);
  const [serialized] = await withFarmerNames([product]);
  res.json(serialized);
}

export async function createProduct(req, res) {
  const values = req.body;
  if (!PRODUCT_CATEGORIES.includes(values.category)) throw new ApiError('Choose a valid category.', 400);
  if (!getUnitsForCategory(values.category).includes(values.unit)) throw new ApiError('Choose a unit valid for this category.', 400);

  const kgPerUnit = resolveKgPerUnit(values.unit, values.kgPerUnit);
  const now = new Date().toISOString();
  const row = {
    farmer_id: req.profile.id,
    name: values.name.trim(),
    category: values.category,
    grade: values.grade || 'A',
    selling_type: values.sellingType || 'retail',
    bulk_min_quantity: values.sellingType === 'bulk' ? Number(values.bulkMinQuantity) : null,
    price: Number(values.price),
    unit: values.unit,
    kg_per_unit: values.unit === 'kg' ? null : kgPerUnit,
    quantity: Number(values.quantity),
    location: values.location.trim(),
    description: values.description?.trim() || '',
    image_url: values.image || null,
    status: 'active',
    price_review: buildPriceReview(values.marketReference, values.price, null, kgPerUnit),
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
  const kgPerUnit = resolveKgPerUnit(unit, values.kgPerUnit ?? existing.kg_per_unit);
  const price = values.price !== undefined ? Number(values.price) : Number(existing.price);
  const quantity = values.quantity !== undefined ? Number(values.quantity) : Number(existing.quantity);
  const sellingType = values.sellingType ?? existing.selling_type;

  const priceReview = values.marketReference !== undefined
    ? buildPriceReview(values.marketReference, price, existing.price_review, kgPerUnit)
    : existing.price_review;

  const row = {
    name: values.name?.trim() ?? existing.name,
    category: values.category ?? existing.category,
    grade: values.grade ?? existing.grade,
    selling_type: sellingType,
    bulk_min_quantity: sellingType === 'bulk' ? Number(values.bulkMinQuantity ?? existing.bulk_min_quantity) : null,
    price,
    unit,
    kg_per_unit: unit === 'kg' ? null : kgPerUnit,
    quantity,
    location: values.location?.trim() ?? existing.location,
    description: values.description?.trim() ?? existing.description,
    image_url: values.image !== undefined ? values.image || null : existing.image_url,
    status: values.status || (quantity > 0 ? existing.status : 'inactive'),
    price_review: priceReview,
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
