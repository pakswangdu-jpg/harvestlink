import { supabaseAdmin } from '../lib/supabaseClient.js';
import { ApiError } from '../lib/ApiError.js';
import { getCatalog, invalidateCatalogCache } from '../lib/catalogRepo.js';
import { getFixedKgPerUnit } from '../lib/unitConversion.js';
import { findCommodityById, resolveEffectiveReference } from '../lib/effectiveMarketPrice.js';
import { generateProductPriceInsight } from '../lib/geminiService.js';

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

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function formatPhp(value) {
  return `₱${roundMoney(value).toFixed(2)}`;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function normalizeEvidenceText(value) {
  return String(value || '').trim().toLowerCase();
}

function trendPercentFromPoints(points) {
  const valid = (points || [])
    .map((point) => ({ year: Number(point.year), price: Number(point.price) }))
    .filter((point) => Number.isFinite(point.year) && Number.isFinite(point.price) && point.price > 0)
    .sort((a, b) => a.year - b.year);
  if (valid.length < 2) return null;
  const latest = valid.at(-1).price;
  const previous = valid.at(-2).price;
  return roundMoney(((latest - previous) / previous) * 100);
}

function trendLabelFromPercent(value) {
  if (value == null || !Number.isFinite(value)) return 'Insufficient trend data';
  if (value > 1) return 'Increasing';
  if (value < -1) return 'Declining';
  return 'Stable';
}

function demandEvidenceFromText(value) {
  const text = normalizeEvidenceText(value);
  if (['very high', 'high', 'opportunity'].includes(text)) return 'High';
  if (['low', 'none'].includes(text)) return 'Low';
  if (['moderate', 'steady'].includes(text)) return 'Moderate';
  return null;
}

async function getExactDemandSupplyEvidence(productName, unit) {
  const name = normalizeEvidenceText(productName);
  const requestedUnit = normalizeEvidenceText(unit);
  if (!name || !requestedUnit) return { demandLevel: null, supplyLevel: null };

  const since = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();
  try {
    const [orderResult, listingResult] = await Promise.all([
      supabaseAdmin
        .from('orders')
        .select('product_name, unit, quantity, created_at')
        .eq('payment_status', 'paid')
        .gte('created_at', since)
        .limit(500),
      supabaseAdmin
        .from('products')
        .select('name, unit, status, quantity')
        .eq('status', 'active')
        .gt('quantity', 0),
    ]);

    const exactOrders = (orderResult.data || []).filter((row) =>
      normalizeEvidenceText(row.product_name) === name
      && normalizeEvidenceText(row.unit) === requestedUnit);
    const exactListings = (listingResult.data || []).filter((row) =>
      normalizeEvidenceText(row.name) === name
      && normalizeEvidenceText(row.unit) === requestedUnit);

    const demandVolume = exactOrders.reduce((sum, row) => sum + (Number(row.quantity) > 0 ? Number(row.quantity) : 0), 0);
    const listingCount = exactListings.length;
    const listingStock = exactListings.reduce((sum, row) => sum + (Number(row.quantity) > 0 ? Number(row.quantity) : 0), 0);
    const demandPerListing = demandVolume / Math.max(listingCount, 1);
    const demandLevel = demandVolume <= 0 ? 'Low' : demandPerListing >= 10 ? 'High' : 'Moderate';
    const supplyLevel = exactListings.length === 0 ? 'Low'
      : listingStock >= 100 ? 'High'
        : listingStock >= 20 ? 'Moderate'
          : 'Low';
    return { demandLevel, supplyLevel };
  } catch {
    return { demandLevel: null, supplyLevel: null };
  }
}

function calculateDynamicRecommendation({
  marketReference,
  requestedUnit,
  costPrice,
  marketTrendPercent,
  exactAverage,
  exactTrend,
  demandLevel,
  supplyLevel,
}) {
  const marketBase = roundMoney(marketReference);
  if (!Number.isFinite(marketBase) || marketBase <= 0) return null;

  let trendPercent = marketTrendPercent != null ? marketTrendPercent : null;
  let trendLabel = trendLabelFromPercent(trendPercent);
  if (exactTrend && trendPercent == null) {
    trendLabel = exactTrend === 'rising' ? 'Increasing' : exactTrend === 'falling' ? 'Declining' : 'Stable';
    trendPercent = exactTrend === 'rising' ? 3 : exactTrend === 'falling' ? -3 : 0;
  }
  trendPercent = trendPercent != null ? clamp(trendPercent, -12.5, 12.5) : 0;
  const trendAdjustment = roundMoney(trendPercent);

  const demandAdjustment = demandLevel === 'High' ? 2 : demandLevel === 'Low' ? -2 : 0;
  const supplyAdjustment = supplyLevel === 'Low' ? 2 : supplyLevel === 'High' ? -1 : 0;

  let blendedReference = marketBase;
  if (Number.isFinite(exactAverage) && exactAverage > 0) {
    const differencePercent = Math.abs((exactAverage - marketBase) / marketBase);
    if (differencePercent <= 0.25) blendedReference = roundMoney((marketBase * 0.75) + (exactAverage * 0.25));
  }

  const evidenceAdjustment = roundMoney(trendAdjustment + demandAdjustment + supplyAdjustment);
  const boundedAdjustment = roundMoney(clamp(evidenceAdjustment, -15, 20));
  let recommended = roundMoney(blendedReference * (1 + boundedAdjustment / 100));

  const cost = Number.isFinite(costPrice) && costPrice > 0 ? costPrice : null;
  const profitabilityFloor = cost ? roundMoney(cost * 1.15) : null;
  const unprofitableFloor = profitabilityFloor != null && recommended < profitabilityFloor;
  if (profitabilityFloor != null) recommended = roundMoney(Math.max(recommended, profitabilityFloor));

  const minimumCompetitorPrice = roundMoney(marketBase * 0.85);
  const maximumCompetitorPrice = roundMoney(marketBase * 1.20);
  const belowMarketFloor = recommended < minimumCompetitorPrice;
  const aboveMarketCeiling = recommended > maximumCompetitorPrice;
  if (cost && recommended > cost * 1.15 && aboveMarketCeiling) {
    recommended = maximumCompetitorPrice;
  }
  if (!cost) recommended = roundMoney(clamp(recommended, minimumCompetitorPrice, maximumCompetitorPrice));

  const actualAdjustment = roundMoney(((recommended - marketBase) / marketBase) * 100);
  const profit = cost ? roundMoney(recommended - cost) : null;
  const margin = cost && recommended > 0 ? roundMoney((profit / recommended) * 100) : null;
  const estimatedTotal = null;

  const reasons = [];
  reasons.push(`Market Insights reference: ${formatPhp(marketBase)}/${requestedUnit}.`);
  reasons.push(trendPercent ? `Market trend is ${trendLabel.toLowerCase()} (${trendPercent > 0 ? '+' : ''}${trendPercent}%).` : 'No reliable recent trend adjustment was available.');
  if (demandLevel) reasons.push(`Demand evidence is ${demandLevel.toLowerCase()}.`);
  if (supplyLevel) reasons.push(`Supply evidence is ${supplyLevel.toLowerCase()}.`);
  if (cost) reasons.push(`Production cost of ${formatPhp(cost)}/${requestedUnit} requires at least ${formatPhp(profitabilityFloor)}/${requestedUnit} for a 15% selling margin.`);
  reasons.push(`The final market-supported adjustment is ${actualAdjustment > 0 ? '+' : ''}${actualAdjustment}% from the market reference.`);
  if (belowMarketFloor) reasons.push('The result may be below the practical market range.');
  if (aboveMarketCeiling) reasons.push('The result may be uncompetitive above the 20% market ceiling.');
  if (unprofitableFloor) reasons.push('The recommendation was raised to cover the cost floor.');

  return {
    marketReference: marketBase,
    marketTrend: trendLabel,
    marketTrendPercent: trendPercent,
    adjustmentPercent: actualAdjustment,
    evidenceAdjustment: boundedAdjustment,
    recommendedUnitPrice: recommended,
    costPrice: cost,
    profit,
    margin,
    estimatedTotal,
    belowMarketFloor,
    aboveMarketCeiling,
    why: reasons.join(' '),
  };
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
  const {
    unit, kgPerUnit = null, quantity = '0', costPrice = null,
    productName = '', historicalAverage = null, historicalLowest = null,
    historicalHighest = null, historicalTrend = null, demandLevel = null,
    supplyLevel = null, marketTrendPercent = null,
  } = req.body || {};
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

  const marketReferencePrice = priceForUnit(reference, requestedUnit, kgPerUnit);
  if (marketReferencePrice == null) {
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

  const cost = costPrice == null || costPrice === ''
    ? null
    : Number(costPrice);
  const exactAverage = historicalAverage == null || historicalAverage === ''
    ? null
    : Number(historicalAverage);
  const exactEvidence = await getExactDemandSupplyEvidence(productName, requestedUnit);
  const resolvedDemandLevel = demandEvidenceFromText(demandLevel) || exactEvidence.demandLevel;
  const resolvedSupplyLevel = demandEvidenceFromText(supplyLevel) || exactEvidence.supplyLevel;
  const trendEvidencePercent = marketTrendPercent != null && marketTrendPercent !== ''
    ? Number(marketTrendPercent)
    : trendPercentFromPoints(reference.trendPoints);
  const dynamic = calculateDynamicRecommendation({
    marketReference: marketReferencePrice,
    requestedUnit,
    costPrice: Number.isFinite(cost) ? cost : null,
    marketTrendPercent: Number.isFinite(trendEvidencePercent) ? roundMoney(trendEvidencePercent) : null,
    exactAverage: Number.isFinite(exactAverage) ? exactAverage : null,
    exactTrend: historicalTrend,
    demandLevel: resolvedDemandLevel,
    supplyLevel: resolvedSupplyLevel,
  });
  if (!dynamic) {
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

  const recommendedUnitPrice = dynamic.recommendedUnitPrice;
  const profit = dynamic.profit;
  const aiInsight = productName
    ? await generateProductPriceInsight({
        productName,
        unit: requestedUnit,
        orderCount: Number(req.body?.orderCount || 0),
        averagePrice: Number.isFinite(exactAverage) ? exactAverage : dynamic.marketReference,
        lowestPrice: historicalLowest == null ? dynamic.marketReference : Number(historicalLowest),
        highestPrice: historicalHighest == null ? dynamic.marketReference : Number(historicalHighest),
        trend: dynamic.marketTrend,
        costPrice: dynamic.costPrice,
        recommendedPrice: recommendedUnitPrice,
        estimatedProfit: profit,
        estimatedMargin: dynamic.margin,
      })
    : null;

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
    priceRange: {
      minimumPrice: roundMoney(dynamic.belowMarketFloor ? recommendedUnitPrice : recommendedUnitPrice * 0.95),
      maximumPrice: roundMoney(dynamic.aboveMarketCeiling ? recommendedUnitPrice : recommendedUnitPrice * 1.05),
      percent: 5,
    },
    marketTrend: dynamic.marketTrend,
    marketTrendPercent: dynamic.marketTrendPercent,
    adjustmentPercent: dynamic.adjustmentPercent,
    costPrice: dynamic.costPrice,
    estimatedProfit: profit,
    profitMargin: dynamic.margin,
    belowMarketFloor: dynamic.belowMarketFloor,
    aboveMarketCeiling: dynamic.aboveMarketCeiling,
    whyThisPrice: dynamic.why,
    dataSource: reference.source,
    dataUpdatedAt: reference.effectiveDate,
    aiSummary: aiInsight?.summary || null,
    aiRecommendation: aiInsight?.recommendation || null,
    recommendationMethod: aiInsight ? 'Gemini-assisted, evidence-validated' : 'Rule-based, evidence-validated',
    requestedUnit,
    estimatedTotal: formatCents(totalCents),
    source: reference.source,
    effectiveDate: reference.effectiveDate,
    referenceYear: reference.year,
    supportingReference: reference.supportingReference,
  });
}
