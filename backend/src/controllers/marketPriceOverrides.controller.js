import { supabaseAdmin } from '../lib/supabaseClient.js';
import { ApiError } from '../lib/ApiError.js';
import { getCatalog, invalidateCatalogCache } from '../lib/catalogRepo.js';
import { getFixedKgPerUnit } from '../lib/unitConversion.js';
import { findCommodityById, resolveEffectiveReference } from '../lib/effectiveMarketPrice.js';

const ADMIN_PRICE_SOURCES = new Set(['admin_entered', 'verified_local_market']);
const MAX_PRICE = 999999;

function serialize(row) {
  return {
    commodityId: row.commodity_id,
    commodityLabel: row.commodity_label,
    referencePrice: Number(row.reference_price),
    referenceYear: row.reference_year,
    baselinePrice: row.baseline_price == null ? null : Number(row.baseline_price),
    unit: row.unit || 'kg',
    source: row.source || 'admin_entered',
    effectiveDate: row.effective_date,
    supportingReference: row.supporting_reference || null,
    isActive: row.is_active !== false,
    reason: row.reason || null,
    updatedBy: row.updated_by,
    updatedByName: row.updated_by_name,
    updatedAt: row.updated_at,
  };
}

function serializeHistory(row) {
  return {
    id: row.id,
    commodityId: row.commodity_id,
    commodityLabel: row.commodity_label,
    previousPrice: row.previous_price == null ? null : Number(row.previous_price),
    newPrice: row.new_price == null ? null : Number(row.new_price),
    previousUnit: row.previous_unit || null,
    newUnit: row.new_unit || null,
    previousSource: row.previous_source || null,
    newSource: row.new_source || null,
    effectiveDate: row.effective_date || null,
    supportingReference: row.supporting_reference || null,
    reason: row.reason || null,
    updatedBy: row.updated_by,
    updatedByName: row.updated_by_name,
    createdAt: row.created_at,
  };
}

function normalizeUnit(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function toPriceCents(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0 || number > MAX_PRICE) {
    throw new ApiError(`${label} must be greater than 0 and no more than ₱999,999.`, 400);
  }
  const cents = Math.round(number * 100);
  if (cents < 1) throw new ApiError(`${label} must be at least ₱0.01.`, 400);
  return cents;
}

function priceForUnit(reference, unit, kgPerUnit) {
  if (normalizeUnit(reference.unit) === normalizeUnit(unit)) return Math.round(reference.price * 100) / 100;
  const referenceKg = getFixedKgPerUnit(reference.unit);
  const requestedKg = getFixedKgPerUnit(unit);
  if (referenceKg != null && requestedKg != null) {
    return Math.round((reference.price * requestedKg / referenceKg) * 100) / 100;
  }
  if (normalizeUnit(reference.unit) !== 'kg') return null;

  const conversion = requestedKg ?? Number(kgPerUnit);
  if (!Number.isFinite(conversion) || conversion <= 0 || conversion > 100000) return null;
  return Math.round(reference.price * conversion * 100) / 100;
}

function quantityInMilliUnits(value) {
  const text = String(value ?? '').trim();
  if (!/^\d+(?:\.\d{1,3})?$/.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  const milli = BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, '0'));
  return milli > 1000000000000n ? null : milli;
}

function formatCents(cents) {
  return Number(cents) / 100;
}

export async function listOverrides(req, res) {
  const { data, error } = await supabaseAdmin.from('market_price_overrides').select('*');
  if (error) throw new ApiError(error.message, 400);
  res.json(data.map(serialize));
}

export async function setOverride(req, res) {
  const commodityId = req.params.commodityId;
  const commodity = await findCommodityById(commodityId);
  const referencePrice = Number(req.body.referencePrice);
  const referenceYear = Number(req.body.referenceYear);
  const baselinePrice = req.body.baselinePrice == null || req.body.baselinePrice === ''
    ? null
    : Number(req.body.baselinePrice);
  let unit = String(req.body.unit || commodity.unit || 'kg').trim();
  const source = String(req.body.source || 'admin_entered');
  const effectiveDate = String(req.body.effectiveDate || new Date().toISOString().slice(0, 10));
  const reason = String(req.body.reason || '').trim();
  const supportingReference = String(req.body.supportingReference || '').trim() || null;

  toPriceCents(referencePrice, 'Reference price');
  if (baselinePrice != null && (!Number.isFinite(baselinePrice) || baselinePrice < 0 || baselinePrice > MAX_PRICE)) {
    throw new ApiError('PSA baseline price is invalid.', 400);
  }
  if (!Number.isInteger(referenceYear) || referenceYear < 1900 || referenceYear > 9999) {
    throw new ApiError('Choose a valid reference year.', 400);
  }
  if (!unit || unit.length > 30) throw new ApiError('Choose a valid price unit.', 400);
  const { units } = await getCatalog({ includeInactive: true });
  const matchingUnit = units.find((entry) => normalizeUnit(entry.value) === normalizeUnit(unit));
  const isNewCustomUnit = !matchingUnit;
  if (matchingUnit) unit = matchingUnit.value;
  else if (req.body.customUnit !== true || !/[\p{L}\p{N}]/u.test(unit)) {
    throw new ApiError('Choose a valid price unit.', 400);
  }
  if (!ADMIN_PRICE_SOURCES.has(source)) throw new ApiError('Choose a valid reference price source.', 400);
  if (!isValidDate(effectiveDate)) throw new ApiError('Choose a valid effective date.', 400);
  if (!reason || reason.length > 500) throw new ApiError('A reason is required and must be under 500 characters.', 400);
  if (supportingReference && supportingReference.length > 500) {
    throw new ApiError('Supporting reference must be under 500 characters.', 400);
  }
  if (commodity.isCustom && normalizeUnit(unit) !== normalizeUnit(commodity.unit)) {
    throw new ApiError(`Use the commodity's registered unit (${commodity.unit}).`, 400);
  }
  if (isNewCustomUnit) {
    const { data: savedUnit, error: unitError } = await supabaseAdmin
      .from('units')
      .insert({ name: unit, abbreviation: unit.toLowerCase() })
      .select('name, abbreviation')
      .single();
    if (unitError) throw new ApiError(unitError.message, 400);
    unit = savedUnit.abbreviation || savedUnit.name.toLowerCase();
    invalidateCatalogCache();
  }
  const { data, error } = await supabaseAdmin.rpc('set_market_price_override', {
    p_commodity_id: commodityId,
    p_commodity_label: commodity.label,
    p_reference_price: referencePrice,
    p_reference_year: referenceYear,
    p_baseline_price: baselinePrice,
    p_unit: unit,
    p_source: source,
    p_effective_date: effectiveDate,
    p_reason: reason,
    p_supporting_reference: supportingReference,
    p_updated_by: req.profile.id,
    p_updated_by_name: req.profile.name || req.profile.email,
  });
  if (error) throw new ApiError(error.message, 400);
  res.json(serialize(Array.isArray(data) ? data[0] : data));
}

export async function clearOverride(req, res) {
  await findCommodityById(req.params.commodityId);
  const { error } = await supabaseAdmin.rpc('clear_market_price_override', {
    p_commodity_id: req.params.commodityId,
    p_updated_by: req.profile.id,
    p_updated_by_name: req.profile.name || req.profile.email,
  });
  if (error) throw new ApiError(error.message, 400);
  res.status(204).end();
}

export async function getOverrideHistory(req, res) {
  await findCommodityById(req.params.commodityId);
  const { data, error } = await supabaseAdmin
    .from('market_price_override_history')
    .select('*')
    .eq('commodity_id', req.params.commodityId)
    .order('created_at', { ascending: false });
  if (error) throw new ApiError(error.message, 400);
  res.json(data.map(serializeHistory));
}

export async function getRecommendation(req, res) {
  const { unit, kgPerUnit = null, quantity = '0' } = req.body || {};
  const requestedUnit = String(unit || '').trim();
  const milliQuantity = quantityInMilliUnits(quantity);
  if (!requestedUnit || requestedUnit.length > 30) throw new ApiError('Choose a valid product unit.', 400);
  if (milliQuantity == null) throw new ApiError('Quantity must be a non-negative number with up to 3 decimal places.', 400);
  const { units } = await getCatalog();
  if (!units.some((entry) => normalizeUnit(entry.value) === normalizeUnit(requestedUnit))) {
    throw new ApiError('Choose a valid product unit.', 400);
  }
  res.setHeader('Cache-Control', 'no-store');
  const { commodity, reference } = await resolveEffectiveReference(req.params.commodityId);

  if (!reference) {
    res.json({
      commodityId: commodity.id,
      commodityLabel: commodity.label,
      available: false,
      referencePrice: null,
      recommendedUnitPrice: null,
      estimatedTotal: null,
    });
    return;
  }

  const recommendedUnitPrice = priceForUnit(reference, requestedUnit, kgPerUnit);
  if (recommendedUnitPrice == null) {
    res.json({
      commodityId: commodity.id,
      commodityLabel: commodity.label,
      available: false,
      reason: 'unit_mismatch',
      referencePrice: reference.price,
      referenceUnit: reference.unit,
      source: reference.source,
      effectiveDate: reference.effectiveDate,
      recommendedUnitPrice: null,
      estimatedTotal: null,
    });
    return;
  }

  const priceCents = BigInt(toPriceCents(recommendedUnitPrice, 'Recommended price'));
  const totalCents = (priceCents * milliQuantity + 500n) / 1000n;
  if (totalCents > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new ApiError('Quantity is too large to calculate an accurate total.', 400);
  }
  res.json({
    commodityId: commodity.id,
    commodityLabel: commodity.label,
    available: true,
    referencePrice: reference.price,
    referenceUnit: reference.unit,
    recommendedUnitPrice,
    requestedUnit,
    estimatedTotal: formatCents(totalCents),
    source: reference.source,
    effectiveDate: reference.effectiveDate,
    referenceYear: reference.year,
    supportingReference: reference.supportingReference,
  });
}
