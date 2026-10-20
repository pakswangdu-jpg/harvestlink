import { supabaseAdmin } from '../lib/supabaseClient.js';
import { serializeProduct } from '../lib/serialize.js';
import { assertPlausiblePricePerKg, buildPriceReview, resolveKgPerUnit, resubmitPriceReview, reviewDecisionHistory } from '../lib/priceReview.js';
import { getHistoricalPriceAnalysis as computeHistoricalPriceAnalysis } from '../lib/historicalPriceService.js';
import { ApiError } from '../lib/ApiError.js';
import { getCatalog } from '../lib/catalogRepo.js';
import { getWholesalePricingErrors } from '../../shared/pricing.js';
import { notifyAdminsOfPriceReview, notifyFarmerOfPriceDecision } from '../lib/priceReviewNotifications.js';

function resolveWholesalePricing(values, { price, quantity, unit, sellingType, kgPerUnit }, existing = null) {
  const enabled = !values.isDonation && sellingType === 'retail'
    && (values.wholesaleEnabled ?? (existing?.wholesale_price != null));
  if (!enabled) return { wholesalePrice: null, wholesaleMinQuantity: null };

  const wholesalePrice = Number(values.wholesalePrice !== undefined ? values.wholesalePrice : existing?.wholesale_price);
  const wholesaleMinQuantity = Number(values.wholesaleMinQuantity !== undefined
    ? values.wholesaleMinQuantity : existing?.wholesale_min_quantity);
  const errors = getWholesalePricingErrors({ price, quantity, unit, wholesalePrice, wholesaleMinQuantity }, existing && {
    price: existing.price,
    unit: existing.unit,
    wholesalePrice: existing.wholesale_price,
    wholesaleMinQuantity: existing.wholesale_min_quantity,
  });
  if (Object.keys(errors).length) throw new ApiError(Object.values(errors)[0], 400);
  assertPlausiblePricePerKg('Wholesale price', wholesalePrice, kgPerUnit);
  return { wholesalePrice, wholesaleMinQuantity };
}

function titleCaseName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function todayInCebu() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function isExpiredDate(value) {
  if (!value) return false;
  const expirationDate = String(value).slice(0, 10);
  return !/^\d{4}-\d{2}-\d{2}$/.test(expirationDate) || expirationDate < todayInCebu();
}

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

async function withFarmerNames(rows) {
  const farmerIds = [...new Set(rows.map((row) => row.farmer_id))];
  if (!farmerIds.length) return rows.map((row) => serializeProduct(row));

  const [{ data: farmers }, { data: ratings }] = await Promise.all([
    supabaseAdmin.from('profiles').select('id, name, verification_status, gcash_account_name, gcash_qr_url').in('id', farmerIds),
    supabaseAdmin.from('ratings').select('farmer_id, rating').in('farmer_id', farmerIds),
  ]);

  const farmerById = new Map((farmers || []).map((farmer) => [farmer.id, farmer]));
  const ratingSummaryById = new Map();
  (ratings || []).forEach(({ farmer_id: farmerId, rating }) => {
    const entry = ratingSummaryById.get(farmerId) || { total: 0, count: 0 };
    entry.total += rating;
    entry.count += 1;
    ratingSummaryById.set(farmerId, entry);
  });

  return rows.map((row) => {
    const farmer = farmerById.get(row.farmer_id);
    const ratingSummary = ratingSummaryById.get(row.farmer_id);
    return serializeProduct(row, {
      farmerName: farmer?.name || null,
      farmerVerified: farmer?.verification_status === 'verified',
      farmerGcashEnabled: Boolean(farmer?.gcash_account_name && farmer?.gcash_qr_url),
      farmerRating: ratingSummary ? Math.round((ratingSummary.total / ratingSummary.count) * 10) / 10 : null,
      farmerRatingCount: ratingSummary ? ratingSummary.count : 0,
    });
  });
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
  if (req.profile.role === 'farmer') {
    query = query.eq('farmer_id', req.profile.id);
  } else {
    if (req.query.farmerId) query = query.eq('farmer_id', req.query.farmerId);
  }
  if (!['farmer', 'admin'].includes(req.profile.role)) {
    for (const reviewStatus of ['pending', 'needs_adjustment']) {
      query = query.or(`price_review.is.null,price_review->>status.is.null,price_review->>status.neq.${reviewStatus}`);
    }
  }
  if (req.query.activeOnly === 'true') {
    query = query.eq('status', 'active').gt('quantity', 0);



    const pendingReviews = ['farmer', 'admin'].includes(req.profile.role) ? ',price_review->>status.eq.pending' : '';
    query = query.or(`price_review.is.null,price_review->>status.eq.approved${pendingReviews}`);
    query = query.or(`expiration_date.is.null,expiration_date.gte.${todayInCebu()}`);
  }

  const { data, error } = await query;
  if (error) throw new ApiError(error.message, 400);
  res.json(await withFarmerNames(data));
}







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
    .or(`expiration_date.is.null,expiration_date.gte.${todayInCebu()}`)
    .order('created_at', { ascending: false });
  if (error) throw new ApiError(error.message, 400);

  const serialized = await withFarmerNames(data);


  res.json(serialized.map((product) => ({
    id: product.id,
    farmerId: product.farmerId,
    farmerName: product.farmerName,
    farmerVerified: product.farmerVerified,
    farmerRating: product.farmerRating,
    farmerRatingCount: product.farmerRatingCount,
    name: product.name,
    category: product.category,
    grade: product.grade,
    sellingType: product.sellingType,
    moq: product.moq,
    price: product.price,
    wholesalePrice: product.wholesalePrice,
    wholesaleMinQuantity: product.wholesaleMinQuantity,
    unit: product.unit,
    kgPerUnit: product.kgPerUnit,
    quantity: product.quantity,
    location: product.location,
    description: product.description,
    image: product.image,
    status: product.status,
    priceReview: product.priceReview,
    originalPrice: product.originalPrice,
    discountPercent: product.discountPercent,
    createdAt: product.createdAt,
    expirationDate: product.expirationDate,
    updatedAt: product.updatedAt,
  })));
}

export async function getProduct(req, res) {
  const product = await fetchProductOr404(req.params.id);
  if (['pending', 'needs_adjustment'].includes(product.price_review?.status) && req.profile.role !== 'admin'
      && !(req.profile.role === 'farmer' && req.profile.id === product.farmer_id)) {
    throw new ApiError('Product was not found.', 404);
  }
  if (['buyer', 'stakeholder'].includes(req.profile.role) && isExpiredDate(product.expiration_date)) {
    throw new ApiError('This product is no longer available because it has expired.', 404);
  }
  const [serialized] = await withFarmerNames([product]);
  res.json(serialized);
}





export async function getHistoricalPriceAnalysis(req, res) {
  const analysis = await computeHistoricalPriceAnalysis(req.query.name, req.query.unit);
  res.json(analysis);
}







const MERGE_KEY_COLUMNS = ['name', 'category', 'grade', 'unit', 'selling_type'];




async function findMergeTarget(farmerId, row) {
  let query = supabaseAdmin.from('products').select('*').eq('farmer_id', farmerId);
  MERGE_KEY_COLUMNS.forEach((column) => { query = query.eq(column, row[column]); });

  const { data, error } = await query.order('updated_at', { ascending: false }).limit(1);
  if (error) throw new ApiError(error.message, 400);
  return data?.[0] || null;
}

export async function createProduct(req, res) {
  const values = req.body;
  await assertValidCategoryAndUnit(values);

  const kgPerUnit = resolveKgPerUnit(values.unit, values.kgPerUnit);




  if (!values.isDonation) {
    assertPlausiblePricePerKg('Cost per unit', values.costPrice, kgPerUnit);
    assertPlausiblePricePerKg('Price', values.price, kgPerUnit);
  }






  let price = Number(values.price);
  let originalPrice = null;
  let discountPercent = null;
  const hasDiscountInput = values.discountPercent !== undefined && values.discountPercent !== null && String(values.discountPercent).trim() !== '';
  if (!values.isDonation && hasDiscountInput) {
    const requestedDiscount = Number(values.discountPercent);
    if (!Number.isFinite(requestedDiscount) || requestedDiscount < 0 || requestedDiscount > 100) {
      throw new ApiError('Discount percent must be between 0 and 100.', 400);
    }
    if (requestedDiscount > 0) {
      originalPrice = price;
      discountPercent = requestedDiscount;
      price = Number((originalPrice * (1 - requestedDiscount / 100)).toFixed(2));
    }
  }
  const { wholesalePrice, wholesaleMinQuantity } = resolveWholesalePricing(values, {
    price, quantity: Number(values.quantity), unit: values.unit,
    sellingType: values.sellingType || 'retail', kgPerUnit,
  });

  const now = new Date().toISOString();
  const row = {
    farmer_id: req.profile.id,
    name: titleCaseName(values.name),
    category: values.category,
    grade: values.grade || 'A',
    selling_type: values.sellingType || 'retail',
    moq: values.sellingType === 'wholesale' ? Number(values.moq) : null,
    price,
    wholesale_price: wholesalePrice,
    wholesale_min_quantity: wholesaleMinQuantity,
    unit: values.unit,
    kg_per_unit: values.unit === 'kg' ? null : kgPerUnit,
    quantity: Number(values.quantity),
    location: values.location.trim(),
    description: values.description?.trim() || '',
    image_url: values.image || null,
    status: 'active',
    price_review: buildPriceReview(values.marketReference, values.price, null, kgPerUnit),
    cost_price: values.costPrice ? Number(values.costPrice) : null,
    original_price: originalPrice,
    discount_percent: discountPercent,
    expiration_date: values.expirationDate || null,
    created_at: now,
    updated_at: now,
  };






  const mergeTarget = values.allowDuplicate ? null : await findMergeTarget(req.profile.id, row);

  if (mergeTarget) {
    const mergedQuantity = Number(mergeTarget.quantity) + Number(values.quantity);
    const mergePriceChanged = Number(mergeTarget.price) !== row.price || mergeTarget.unit !== row.unit;
    const mergedReview = mergeTarget.price_review
      ? mergePriceChanged ? resubmitPriceReview(values.marketReference, row.price, mergeTarget.price_review, kgPerUnit, row.unit) : mergeTarget.price_review
      : row.price_review;
    const { data, error } = await supabaseAdmin
      .from('products')
      .update({
        quantity: mergedQuantity,



        price: row.price,
        wholesale_price: row.wholesale_price,
        wholesale_min_quantity: row.wholesale_min_quantity,
        moq: row.moq,
        kg_per_unit: row.kg_per_unit,
        location: row.location,
        description: row.description,
        image_url: row.image_url || mergeTarget.image_url,
        cost_price: row.cost_price,



        original_price: row.original_price,
        discount_percent: row.discount_percent,
        expiration_date: row.expiration_date,
        price_review: mergedReview,


        status: mergedReview && ['pending', 'needs_adjustment', 'declined'].includes(mergedReview.status) ? mergeTarget.status : 'active',
        updated_at: now,
      })
      .eq('id', mergeTarget.id)
      .select()
      .single();
    if (error) throw new ApiError(error.message, 400);

    const [serialized] = await withFarmerNames([data]);
    if (mergedReview?.status === 'pending'
        && (mergePriceChanged || mergeTarget.price_review?.status !== 'pending')) {
      await notifyAdminsOfPriceReview(serialized);
    }

    res.json({ ...serialized, merged: true, addedQuantity: Number(values.quantity) });
    return;
  }

  const { data, error } = await supabaseAdmin.from('products').insert(row).select().single();
  if (error) throw new ApiError(error.message, 400);
  const [serialized] = await withFarmerNames([data]);
  if (serialized.priceReview?.status === 'pending') await notifyAdminsOfPriceReview(serialized);
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
  const costPrice = values.costPrice !== undefined ? (values.costPrice ? Number(values.costPrice) : null) : existing.cost_price;
  const { wholesalePrice, wholesaleMinQuantity } = resolveWholesalePricing(values, {
    price, quantity, unit, sellingType, kgPerUnit,
  }, existing);




  if (values.price !== undefined) assertPlausiblePricePerKg('Price', price, kgPerUnit);
  if (values.costPrice !== undefined) assertPlausiblePricePerKg('Cost per unit', costPrice, kgPerUnit);

  let priceReview = values.marketReference !== undefined
    ? buildPriceReview(values.marketReference, price, existing.price_review, kgPerUnit)
    : existing.price_review;
  const priceChanged = price !== Number(existing.price) || unit !== existing.unit
    || kgPerUnit !== resolveKgPerUnit(existing.unit, existing.kg_per_unit);
  if (existing.price_review && priceChanged) {
    priceReview = resubmitPriceReview(values.marketReference, price, existing.price_review, kgPerUnit, unit);
  } else if (existing.price_review && ['needs_adjustment', 'declined', 'approved'].includes(existing.price_review.status)) {
    priceReview = existing.price_review;
  }

  const row = {
    name: values.name !== undefined ? titleCaseName(values.name) : existing.name,
    category,
    grade: values.grade ?? existing.grade,
    selling_type: sellingType,
    moq: sellingType === 'wholesale' ? Number(values.moq ?? existing.moq) : null,
    price,
    wholesale_price: wholesalePrice,
    wholesale_min_quantity: wholesaleMinQuantity,
    unit,
    kg_per_unit: unit === 'kg' ? null : kgPerUnit,
    quantity,
    location: values.location?.trim() ?? existing.location,
    description: values.description?.trim() ?? existing.description,
    image_url: values.image !== undefined ? values.image || null : existing.image_url,
    status: values.status || (quantity > 0 ? existing.status : 'inactive'),
    price_review: priceReview,
    cost_price: costPrice,
    expiration_date: values.expirationDate !== undefined ? (values.expirationDate || null) : existing.expiration_date,
  };

  const { data, error } = await supabaseAdmin.from('products').update(row).eq('id', existing.id).select().single();
  if (error) throw new ApiError(error.message, 400);
  const [serialized] = await withFarmerNames([data]);
  if (priceChanged && serialized.priceReview?.status === 'pending') await notifyAdminsOfPriceReview(serialized);
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
    if (['declined', 'needs_adjustment'].includes(existing.price_review?.status)) {
      throw new ApiError('DTI declined this price — edit the product with a new price before activating it.', 400);
    }
  }

  const statusUpdate = { status };
  if (existing.price_review?.resumeListingStatus) statusUpdate.price_review = { ...existing.price_review, resumeListingStatus: null };
  const { data, error } = await supabaseAdmin.from('products').update(statusUpdate).eq('id', existing.id).select().single();
  if (error) throw new ApiError(error.message, 400);
  const [serialized] = await withFarmerNames([data]);
  res.json(serialized);
}

export async function applyDiscount(req, res) {
  const existing = await fetchProductOr404(req.params.id);
  assertOwnership(req, existing);
  const percent = Number(req.body.percent);


  if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
    throw new ApiError('Discount percent must be between 1 and 100.', 400);
  }

  const originalPrice = existing.original_price ?? existing.price;
  const discountedPrice = Number((originalPrice * (1 - percent / 100)).toFixed(2));
  if (existing.wholesale_price != null && existing.wholesale_price >= discountedPrice) {
    throw new ApiError('Discount would make the retail price no higher than the wholesale price. Update wholesale pricing first.', 400);
  }

  const { data, error } = await supabaseAdmin
    .from('products')
    .update({ original_price: originalPrice, discount_percent: percent, price: discountedPrice,
      ...(existing.price_review && Number(existing.price) !== discountedPrice ? { price_review: resubmitPriceReview(null, discountedPrice, existing.price_review, resolveKgPerUnit(existing.unit, existing.kg_per_unit), existing.unit) } : {}) })
    .eq('id', existing.id)
    .select()
    .single();
  if (error) throw new ApiError(error.message, 400);
  const [serialized] = await withFarmerNames([data]);
  if (Number(existing.price) !== discountedPrice && serialized.priceReview?.status === 'pending') {
    await notifyAdminsOfPriceReview(serialized);
  }
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
    .update({ price: existing.original_price, original_price: null, discount_percent: null,
      ...(existing.price_review && Number(existing.price) !== Number(existing.original_price) ? { price_review: resubmitPriceReview(null, existing.original_price, existing.price_review, resolveKgPerUnit(existing.unit, existing.kg_per_unit), existing.unit) } : {}) })
    .eq('id', existing.id)
    .select()
    .single();
  if (error) throw new ApiError(error.message, 400);
  const [serialized] = await withFarmerNames([data]);
  if (Number(existing.price) !== Number(existing.original_price) && serialized.priceReview?.status === 'pending') {
    await notifyAdminsOfPriceReview(serialized);
  }
  res.json(serialized);
}




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
  const isDeclined = ['declined', 'needs_adjustment'].includes(product.price_review?.status);
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
  const { data, error } = await supabaseAdmin.from('products').select('*').or('price_review->>status.eq.declined,price_review->>status.eq.needs_adjustment');
  if (error) throw new ApiError(error.message, 400);
  res.json(await withFarmerNames(data));
}

export async function approvePriceReview(req, res) {
  const existing = await fetchProductOr404(req.params.id);
  if (existing.price_review?.status !== 'pending') throw new ApiError('This product no longer has a pending price review.', 409);
  if (req.body?.submittedPrice != null && Number(req.body.submittedPrice) !== Number(existing.price)
      || req.body?.unit != null && req.body.unit !== existing.unit) throw new ApiError('The submitted price changed. Reload this review.', 409);

  const { data, error } = await supabaseAdmin
    .from('products')
    .update({
      status: existing.status === 'inactive' && existing.price_review.resumeListingStatus === 'active' && Number(existing.quantity) > 0 ? 'active' : existing.status,
      price_review: { ...existing.price_review, status: 'approved', approvedPrice: Number(existing.price), reviewUnit: existing.unit,
        maxAllowedPrice: null, declineReason: null, resumeListingStatus: null,
        decidedAt: new Date().toISOString(), decidedBy: req.profile.id,
        previousDecisions: reviewDecisionHistory(existing.price_review) },
    })
    .eq('id', existing.id)
    .eq('price_review->>status', 'pending').eq('price', existing.price).eq('unit', existing.unit)
    .eq('status', existing.status).eq('quantity', existing.quantity)
    .select()
    .single();
  if (error) throw new ApiError(error.code === 'PGRST116' ? 'This review changed. Reload before deciding.' : error.message, error.code === 'PGRST116' ? 409 : 400);
  const [serialized] = await withFarmerNames([data]);
  await notifyFarmerOfPriceDecision(serialized, 'approved');
  res.json(serialized);
}

export async function declinePriceReview(req, res) {
  const existing = await fetchProductOr404(req.params.id);
  if (existing.price_review?.status !== 'pending') throw new ApiError('This product no longer has a pending price review.', 409);
  const adjustment = req.body?.maxAllowedPrice !== undefined;
  const maxAllowedPrice = Number(req.body?.maxAllowedPrice);
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  if (adjustment) {
    if (!Number.isFinite(maxAllowedPrice) || maxAllowedPrice <= 0) throw new ApiError('Enter a positive maximum acceptable price.', 400);
    if (!reason || reason.length > 1000) throw new ApiError('Enter a reason of up to 1000 characters.', 400);
    if (req.body.unit !== existing.unit) throw new ApiError('The maximum price must use the product unit.', 400);
    assertPlausiblePricePerKg('Maximum acceptable price', maxAllowedPrice, resolveKgPerUnit(existing.unit, existing.kg_per_unit));
    if (Number(req.body.submittedPrice) !== Number(existing.price)) throw new ApiError('The submitted price changed. Reload this review.', 409);
  }

  const { data, error } = await supabaseAdmin
    .from('products')
    .update({
      status: 'inactive',
      price_review: { ...existing.price_review, status: adjustment ? 'needs_adjustment' : 'declined', decidedAt: new Date().toISOString(),
        decidedBy: req.profile.id, previousDecisions: reviewDecisionHistory(existing.price_review),
        ...(adjustment ? { maxAllowedPrice, reviewUnit: existing.unit, declineReason: reason, resumeListingStatus: existing.status } : {}) },
    })
    .eq('id', existing.id)
    .eq('price_review->>status', 'pending').eq('price', existing.price).eq('unit', existing.unit)
    .eq('status', existing.status).eq('quantity', existing.quantity)
    .select()
    .single();
  if (error) throw new ApiError(error.code === 'PGRST116' ? 'This review changed. Reload before deciding.' : error.message, error.code === 'PGRST116' ? 409 : 400);
  const [serialized] = await withFarmerNames([data]);
  await notifyFarmerOfPriceDecision(serialized, adjustment ? 'adjustment' : 'declined');
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
      price_review: { ...existing.price_review, status: 'approved', decidedAt: new Date().toISOString(),
        decidedBy: req.profile.id, approvedPrice: Number(existing.price), reviewUnit: existing.unit,
        previousDecisions: reviewDecisionHistory(existing.price_review) },
    })
    .eq('id', existing.id)
    .select()
    .single();
  if (error) throw new ApiError(error.message, 400);
  const [serialized] = await withFarmerNames([data]);
  res.json(serialized);
}
