import { supabaseAdmin } from '../lib/supabaseClient.js';
import { ApiError } from '../lib/ApiError.js';
import { getCatalog, invalidateCatalogCache } from '../lib/catalogRepo.js';
import { getFixedKgPerUnit } from '../lib/unitConversion.js';
import { findCommodityById, resolveEffectiveReference } from '../lib/effectiveMarketPrice.js';
import { generateProductPriceInsight } from '../lib/geminiService.js';
import {
  calculateWholesalePricing,
  parseOptionalNonNegativeNumber,
  parseOptionalPositiveNumber,
} from '../../shared/pricing.js';

const ADMIN_PRICE_SOURCES = new Set(['admin_entered', 'verified_local_market']);
const MARKET_TYPES = new Set(['retail', 'wholesale']);
const MAX_PRICE = 999999;

function parseMarketType(value, { required = false } = {}) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) {
    if (required) throw new ApiError('Choose a valid market type (Retail or Wholesale).', 400);
    return null;
  }
  if (!MARKET_TYPES.has(normalized)) {
    throw new ApiError('Choose a valid market type (Retail or Wholesale).', 400);
  }
  return normalized;
}

function validateSupportingReference(value, source) {
  const trimmed = String(value || '').trim();
  if (ADMIN_PRICE_SOURCES.has(source)) {
    const words = trimmed.split(/\s+/).filter(Boolean);
    if (trimmed.length < 10 || words.length < 2) {
      throw new ApiError(
        'Supporting reference is required for manually collected market prices and must include source and location details.',
        400,
      );
    }
  }
  if (trimmed.length > 500) {
    throw new ApiError('Supporting reference must be under 500 characters.', 400);
  }
  return trimmed || null;
}

function serialize(row) {
  return {
    id: row.id,
    commodityId: row.commodity_id,
    commodityLabel: row.commodity_label,
    marketType: row.market_type || null,
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
    marketType: row.market_type || null,
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
  if (!name || !requestedUnit) return { demandLevel: null, supplyLevel: null, wholesaleMarketPrice: null, wholesaleOrderCount: 0 };

  const since = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();
  try {
    const [orderResult, listingResult] = await Promise.all([
      supabaseAdmin
        .from('orders')
        .select('product_id, product_name, unit, quantity, unit_price, created_at')
        .eq('payment_status', 'paid')
        .gte('created_at', since)
        .limit(500),
      supabaseAdmin
        .from('products')
        .select('id, name, unit, status, quantity, selling_type')
        .eq('status', 'active')
        .gt('quantity', 0),
    ]);

    const exactOrders = (orderResult.data || []).filter((row) =>
      normalizeEvidenceText(row.product_name) === name
      && normalizeEvidenceText(row.unit) === requestedUnit);
    const exactListings = (listingResult.data || []).filter((row) =>
      normalizeEvidenceText(row.name) === name
      && normalizeEvidenceText(row.unit) === requestedUnit);

    const wholesaleProductIds = new Set(
      exactListings
        .filter((row) => row.selling_type === 'wholesale')
        .map((row) => row.id),
    );
    const wholesaleOrders = exactOrders.filter((row) =>
      wholesaleProductIds.has(row.product_id) && Number(row.unit_price) > 0);
    const wholesaleOrderCount = wholesaleOrders.length;
    const wholesaleMarketPrice = wholesaleOrderCount >= 3
      ? roundMoney(wholesaleOrders.reduce((sum, row) => sum + Number(row.unit_price), 0) / wholesaleOrderCount)
      : null;

    // Only report demand/supply evidence when there are enough verified orders to avoid unsupported adjustments.
    if (exactOrders.length < 3) {
      return { demandLevel: null, supplyLevel: null, wholesaleMarketPrice, wholesaleOrderCount };
    }

    const demandVolume = exactOrders.reduce((sum, row) => sum + (Number(row.quantity) > 0 ? Number(row.quantity) : 0), 0);
    const listingCount = exactListings.length;
    const listingStock = exactListings.reduce((sum, row) => sum + (Number(row.quantity) > 0 ? Number(row.quantity) : 0), 0);
    const demandPerListing = demandVolume / Math.max(listingCount, 1);
    const demandLevel = demandPerListing >= 10 ? 'High' : 'Moderate';
    const supplyLevel = exactListings.length === 0 ? 'Low'
      : listingStock >= 100 ? 'High'
        : listingStock >= 20 ? 'Moderate'
          : 'Low';
    return { demandLevel, supplyLevel, wholesaleMarketPrice, wholesaleOrderCount };
  } catch {
    return { demandLevel: null, supplyLevel: null, wholesaleMarketPrice: null, wholesaleOrderCount: 0 };
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
  const hasReliableTrend = trendPercent != null && Number.isFinite(trendPercent);
  if (!hasReliableTrend && exactTrend && ['rising', 'falling', 'stable'].includes(exactTrend)) {
    trendLabel = exactTrend === 'rising' ? 'Increasing' : exactTrend === 'falling' ? 'Declining' : 'Stable';
    trendPercent = exactTrend === 'rising' ? 3 : exactTrend === 'falling' ? -3 : 0;
  }
  trendPercent = trendPercent != null ? clamp(trendPercent, -12.5, 12.5) : 0;
  const trendAdjustment = roundMoney(trendPercent);

  const demandAdjustment = demandLevel === 'High' ? 2 : demandLevel === 'Low' ? -2 : 0;
  const supplyAdjustment = supplyLevel === 'Low' ? 2 : supplyLevel === 'High' ? -1 : 0;

  let blendedReference = marketBase;
  let usedHistoricalBlend = false;
  if (Number.isFinite(exactAverage) && exactAverage > 0) {
    const differencePercent = Math.abs((exactAverage - marketBase) / marketBase);
    if (differencePercent <= 0.25) {
      blendedReference = roundMoney((marketBase * 0.75) + (exactAverage * 0.25));
      usedHistoricalBlend = true;
    }
  }

  const evidenceAdjustment = roundMoney(trendAdjustment + demandAdjustment + supplyAdjustment);
  const boundedAdjustment = roundMoney(clamp(evidenceAdjustment, -15, 20));
  let recommended = roundMoney(blendedReference * (1 + boundedAdjustment / 100));

  const minimumCompetitorPrice = roundMoney(marketBase * 0.85);
  const maximumCompetitorPrice = roundMoney(marketBase * 1.20);
  recommended = roundMoney(clamp(recommended, minimumCompetitorPrice, maximumCompetitorPrice));

  const cost = Number.isFinite(costPrice) && costPrice > 0 ? roundMoney(costPrice) : null;
  const belowMarketFloor = recommended < minimumCompetitorPrice;
  const aboveMarketCeiling = recommended > maximumCompetitorPrice;
  const isBelowBreakEven = cost != null && recommended < cost;

  const actualAdjustment = roundMoney(((recommended - marketBase) / marketBase) * 100);
  const profit = cost != null ? roundMoney(recommended - cost) : null;
  const margin = cost != null && recommended > 0 ? roundMoney((profit / recommended) * 100) : null;

  const reasons = [];
  reasons.push(`Reference price: ${formatPhp(marketBase)}/${requestedUnit}.`);
  if (usedHistoricalBlend) {
    reasons.push(`Blended with verified historical market average (${formatPhp(exactAverage)}/${requestedUnit}) → ${formatPhp(blendedReference)}/${requestedUnit}.`);
  }
  reasons.push(trendPercent
    ? `Reliable market trend is ${trendLabel.toLowerCase()} (${trendPercent > 0 ? '+' : ''}${trendPercent}%).`
    : 'No reliable recent market trend adjustment was applied.');
  if (demandLevel) reasons.push(`Demand evidence is ${demandLevel.toLowerCase()}.`);
  if (supplyLevel) reasons.push(`Supply evidence is ${supplyLevel.toLowerCase()}.`);
  if (cost != null) {
    reasons.push(isBelowBreakEven
      ? `Warning: recommended retail price (${formatPhp(recommended)}/${requestedUnit}) is below your production break-even cost (${formatPhp(cost)}/${requestedUnit}).`
      : `At production cost ${formatPhp(cost)}/${requestedUnit}, estimated retail profit is ${formatPhp(profit)}/${requestedUnit} (${margin}% margin).`);
  } else {
    reasons.push('Production cost was not provided, so break-even cost and profit could not be calculated.');
  }

  const formulaLines = [
    `Retail Reference = ${formatPhp(marketBase)}/${requestedUnit}`,
    actualAdjustment !== 0
      ? `Recommended Retail Price = ${formatPhp(blendedReference)} × (1 ${actualAdjustment >= 0 ? '+' : '−'} ${Math.abs(actualAdjustment)}%) = ${formatPhp(recommended)}/${requestedUnit}`
      : `Recommended Retail Price = ${formatPhp(recommended)}/${requestedUnit} (no unsupported adjustment applied)`,
  ];
  if (cost != null) {
    formulaLines.push(`Estimated Retail Profit = ${formatPhp(recommended)} − ${formatPhp(cost)} = ${formatPhp(profit)}/${requestedUnit} (${margin}% margin)`);
  }

  return {
    marketReference: marketBase,
    marketTrend: trendLabel,
    marketTrendPercent: trendPercent,
    adjustmentPercent: actualAdjustment,
    evidenceAdjustment: boundedAdjustment,
    recommendedUnitPrice: recommended,
    costPrice: cost,
    breakEvenCost: cost,
    isBelowBreakEven,
    profit,
    margin,
    estimatedTotal: null,
    belowMarketFloor,
    aboveMarketCeiling,
    why: reasons.join(' '),
    formulaLines,
  };
}

export async function listOverrides(req, res) {
  const marketType = parseMarketType(req.query?.marketType);
  let query = supabaseAdmin.from('market_price_overrides').select('*');
  if (marketType) query = query.eq('market_type', marketType);
  const { data, error } = await query;
  if (error) throw new ApiError(error.message, 400);
  res.json(data.map(serialize));
}

export async function setOverride(req, res) {
  const commodityId = req.params.commodityId;
  const commodity = await findCommodityById(commodityId);
  const marketType = parseMarketType(req.body.marketType, { required: true });
  const referencePrice = Number(req.body.referencePrice);
  const referenceYear = Number(req.body.referenceYear);
  const baselinePrice = req.body.baselinePrice == null || req.body.baselinePrice === ''
    ? null
    : Number(req.body.baselinePrice);
  let unit = String(req.body.unit || commodity.unit || 'kg').trim();
  const source = String(req.body.source || 'admin_entered');
  const effectiveDate = String(req.body.effectiveDate || new Date().toISOString().slice(0, 10));
  const reason = String(req.body.reason || '').trim();

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
  const supportingReference = validateSupportingReference(req.body.supportingReference, source);
  if (!reason || reason.length > 500) throw new ApiError('A reason is required and must be under 500 characters.', 400);
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
    p_market_type: marketType,
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
  const marketType = parseMarketType(req.query?.marketType || req.body?.marketType, { required: true });
  const { error } = await supabaseAdmin.rpc('clear_market_price_override', {
    p_commodity_id: req.params.commodityId,
    p_market_type: marketType,
    p_updated_by: req.profile.id,
    p_updated_by_name: req.profile.name || req.profile.email,
  });
  if (error) throw new ApiError(error.message, 400);
  res.status(204).end();
}

export async function getOverrideHistory(req, res) {
  await findCommodityById(req.params.commodityId);
  const marketType = parseMarketType(req.query?.marketType);
  let query = supabaseAdmin
    .from('market_price_override_history')
    .select('*')
    .eq('commodity_id', req.params.commodityId);
  if (marketType) query = query.eq('market_type', marketType);
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw new ApiError(error.message, 400);
  res.json(data.map(serializeHistory));
}

export async function getRecommendation(req, res) {
  const {
    unit, kgPerUnit = null, quantity = '0', costPrice = null,
    productName = '', historicalAverage = null, historicalLowest = null,
    historicalHighest = null, historicalTrend = null, demandLevel = null,
    supplyLevel = null, marketTrendPercent = null,
    sellingType = 'retail', moq = null, handlingCostPerOrder = null,
    targetProfitMargin = null, sellingPrice = null,
  } = req.body || {};
  const requestedUnit = String(unit || '').trim();
  const normalizedSalesType = String(sellingType || 'retail').trim().toLowerCase() === 'wholesale'
    ? 'wholesale'
    : 'retail';
  const milliQuantity = quantityInMilliUnits(quantity);
  if (!requestedUnit || requestedUnit.length > 30) throw new ApiError('Choose a valid product unit.', 400);
  if (milliQuantity == null) throw new ApiError('Quantity must be a non-negative number with up to 3 decimal places.', 400);
  const { units } = await getCatalog();
  if (!units.some((entry) => normalizeUnit(entry.value) === normalizeUnit(requestedUnit))) {
    throw new ApiError('Choose a valid product unit.', 400);
  }
  res.setHeader('Cache-Control', 'no-store');

  // Never treat missing or empty production cost as zero.
  const cost = parseOptionalPositiveNumber(costPrice);
  const parsedSellingPrice = parseOptionalPositiveNumber(sellingPrice);
  const parsedHandlingCost = parseOptionalNonNegativeNumber(handlingCostPerOrder);
  const parsedMoq = parseOptionalPositiveNumber(moq);
  const parsedTargetMargin = parseOptionalNonNegativeNumber(targetProfitMargin);
  const numericQuantity = Number(milliQuantity) / 1000;
  const exactAverage = parseOptionalPositiveNumber(historicalAverage);

  if (normalizedSalesType === 'wholesale') {
    const [wholesaleResolved, retailResolved, exactEvidence] = await Promise.all([
      resolveEffectiveReference(req.params.commodityId, { marketType: 'wholesale' }),
      resolveEffectiveReference(req.params.commodityId, { marketType: 'retail' }),
      getExactDemandSupplyEvidence(productName, requestedUnit),
    ]);
    const commodity = wholesaleResolved.commodity;
    const wholesaleReference = wholesaleResolved.reference;
    const retailReference = retailResolved.reference;

    const wholesaleRefUnitPrice = wholesaleReference
      ? priceForUnit(wholesaleReference, requestedUnit, kgPerUnit)
      : null;

    if (wholesaleReference && wholesaleRefUnitPrice == null) {
      res.json({
        commodityId: commodity.id,
        commodityLabel: commodity.label,
        salesType: 'wholesale',
        available: false,
        reason: 'unit_mismatch',
        referencePrice: wholesaleReference.price,
        referenceUnit: wholesaleReference.unit,
        referenceMarketType: 'wholesale',
        source: wholesaleReference.source,
        effectiveDate: wholesaleReference.effectiveDate,
        recommendedUnitPrice: null,
        estimatedTotal: null,
      });
      return;
    }

    const retailRefUnitPrice = retailReference
      ? priceForUnit(retailReference, requestedUnit, kgPerUnit)
      : null;

    // Never substitute a retail reference price for wholesale.
    const wholesale = calculateWholesalePricing({
      productionCost: cost,
      handlingCostPerOrder: parsedHandlingCost,
      moq: parsedMoq,
      availableQuantity: numericQuantity > 0 ? numericQuantity : null,
      targetProfitMargin: parsedTargetMargin,
      sellingPrice: parsedSellingPrice,
      wholesaleReferencePrice: wholesaleRefUnitPrice,
      wholesaleMarketPrice: exactEvidence.wholesaleMarketPrice,
      unit: requestedUnit,
    });

    if (wholesale.recommendedPrice == null) {
      res.json({
        commodityId: commodity.id,
        commodityLabel: commodity.label,
        salesType: 'wholesale',
        available: false,
        reason: wholesale.moqExceedsStock ? 'moq_exceeds_stock' : 'no_wholesale_reference',
        referencePrice: null,
        referenceUnit: null,
        referenceMarketType: 'wholesale',
        retailRecommendedPrice: retailRefUnitPrice,
        recommendedUnitPrice: null,
        pricingBasis: wholesale.pricingBasis,
        wholesaleMarketDataAvailable: false,
        insufficientMarketData: true,
        costPrice: wholesale.productionCost,
        handlingCostPerOrder: wholesale.handlingCostPerOrder,
        handlingCostPerUnit: wholesale.handlingCostPerUnit,
        totalCostPerUnit: wholesale.totalCostPerUnit,
        breakEvenCost: wholesale.breakEvenCost,
        targetProfitMargin: wholesale.targetProfitMargin,
        moq: wholesale.moq,
        moqExceedsStock: wholesale.moqExceedsStock,
        minimumOrderTotal: null,
        missingInputs: wholesale.missingInputs,
        estimatedTotal: null,
        whyThisPrice: wholesale.moqExceedsStock
          ? `MOQ (${wholesale.moq} ${requestedUnit}) exceeds available stock (${wholesale.availableQuantity} ${requestedUnit}). Reduce MOQ or increase available stock to calculate wholesale pricing.`
          : `No verified wholesale reference price is available for ${commodity.label}. Enter ${wholesale.missingInputs.join(', ')} to calculate a cost-based wholesale estimate. Retail reference prices are never substituted for wholesale.`,
      });
      return;
    }

    const recommendedUnitPrice = wholesale.recommendedPrice;
    const priceCents = BigInt(toPriceCents(recommendedUnitPrice, 'Recommended price'));
    const totalCents = (priceCents * milliQuantity + 500n) / 1000n;
    if (totalCents > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new ApiError('Quantity is too large to calculate an accurate total.', 400);
    }

    const formulaLines = [];
    const whyParts = [];
    let wholesaleVsRetailExplanation;

    if (wholesale.moqExceedsStock) {
      whyParts.push(`MOQ (${wholesale.moq} ${requestedUnit}) exceeds available stock (${wholesale.availableQuantity} ${requestedUnit}). Reduce MOQ or increase available stock to calculate wholesale costs.`);
    }

    if (wholesale.pricingBasis === 'wholesale_reference') {
      whyParts.push(`Uses the active wholesale reference price of ${formatPhp(wholesaleRefUnitPrice)}/${requestedUnit}.`);
      formulaLines.push(`Wholesale Reference Price = ${formatPhp(wholesaleRefUnitPrice)}/${requestedUnit}`);
      if (wholesale.handlingCostPerUnit != null) {
        formulaLines.push(`Handling Cost per ${requestedUnit} = ${formatPhp(wholesale.effectiveHandlingCostPerOrder)} ÷ ${wholesale.moq} ${requestedUnit} = ${formatPhp(wholesale.handlingCostPerUnit)}/${requestedUnit}`);
      }
      if (wholesale.totalCostPerUnit != null) {
        formulaLines.push(`Break-Even Cost per ${requestedUnit} = ${formatPhp(wholesale.productionCost)} + ${formatPhp(wholesale.handlingCostPerUnit ?? 0)} = ${formatPhp(wholesale.totalCostPerUnit)}/${requestedUnit}`);
      }
      if (wholesale.recommendedCostBasedPrice != null) {
        formulaLines.push(`Cost-Based Target (${wholesale.targetProfitMargin}% margin) = ${formatPhp(wholesale.totalCostPerUnit)} ÷ (1 − ${wholesale.targetProfitMargin}% / 100) = ${formatPhp(wholesale.recommendedCostBasedPrice)}/${requestedUnit}`);
      }
    } else if (wholesale.pricingBasis === 'wholesale_market_data') {
      whyParts.push(`Based on ${exactEvidence.wholesaleOrderCount} verified paid wholesale orders averaging ${formatPhp(wholesale.wholesaleMarketPrice)}/${requestedUnit}.`);
      formulaLines.push(`Wholesale Market Price = ${formatPhp(wholesale.wholesaleMarketPrice)}/${requestedUnit} (from ${exactEvidence.wholesaleOrderCount} verified wholesale orders)`);
    } else {
      whyParts.push('No verified wholesale reference price is available for this commodity, so this recommendation is a cost-based wholesale estimate.');
      formulaLines.push(`Handling Cost per ${requestedUnit} = ${formatPhp(wholesale.effectiveHandlingCostPerOrder)} ÷ ${wholesale.moq} ${requestedUnit} = ${formatPhp(wholesale.handlingCostPerUnit)}/${requestedUnit}`);
      formulaLines.push(`Total Cost per ${requestedUnit} = ${formatPhp(wholesale.productionCost)} + ${formatPhp(wholesale.handlingCostPerUnit)} = ${formatPhp(wholesale.totalCostPerUnit)}/${requestedUnit}`);
      formulaLines.push(`Recommended Wholesale Price = ${formatPhp(wholesale.totalCostPerUnit)} ÷ (1 − ${wholesale.targetProfitMargin}% / 100) = ${formatPhp(recommendedUnitPrice)}/${requestedUnit}`);
    }

    if (wholesale.minimumOrderTotal != null) {
      formulaLines.push(`Minimum Order Total = ${formatPhp(recommendedUnitPrice)} × ${wholesale.moq} ${requestedUnit} = ${formatPhp(wholesale.minimumOrderTotal)}`);
    }
    if (wholesale.totalExpenses != null) {
      formulaLines.push(`Total Expenses (MOQ) = ${formatPhp(wholesale.totalCostPerUnit)} × ${wholesale.moq} ${requestedUnit} = ${formatPhp(wholesale.totalExpenses)}`);
    }
    if (wholesale.estimatedGrossProfit != null) {
      formulaLines.push(`Estimated Gross Profit (MOQ) = ${formatPhp(wholesale.minimumOrderTotal)} − ${formatPhp(wholesale.totalExpenses)} = ${formatPhp(wholesale.estimatedGrossProfit)}`);
    }
    if (wholesale.estimatedStockValue != null) {
      formulaLines.push(`Estimated Stock Value = ${formatPhp(recommendedUnitPrice)} × ${wholesale.availableQuantity} ${requestedUnit} = ${formatPhp(wholesale.estimatedStockValue)}`);
    }

    if (retailRefUnitPrice != null) {
      const diffFromRetail = roundMoney(recommendedUnitPrice - retailRefUnitPrice);
      if (diffFromRetail < 0) {
        wholesaleVsRetailExplanation = `Wholesale (${formatPhp(recommendedUnitPrice)}/${requestedUnit}) is ${formatPhp(Math.abs(diffFromRetail))}/${requestedUnit} lower than Retail (${formatPhp(retailRefUnitPrice)}/${requestedUnit}).`;
      } else if (diffFromRetail > 0) {
        wholesaleVsRetailExplanation = `Wholesale (${formatPhp(recommendedUnitPrice)}/${requestedUnit}) is ${formatPhp(diffFromRetail)}/${requestedUnit} higher than Retail (${formatPhp(retailRefUnitPrice)}/${requestedUnit}).`;
      } else {
        wholesaleVsRetailExplanation = `Wholesale (${formatPhp(recommendedUnitPrice)}/${requestedUnit}) matches the Retail reference (${formatPhp(retailRefUnitPrice)}/${requestedUnit}).`;
      }
    } else {
      wholesaleVsRetailExplanation = 'Calculated independently for Wholesale without substituting a retail reference price.';
    }

    if (wholesale.isRecommendedBelowBreakEven) {
      whyParts.push(`Warning: recommended wholesale price (${formatPhp(recommendedUnitPrice)}/${requestedUnit}) is below your calculated break-even cost (${formatPhp(wholesale.breakEvenCost)}/${requestedUnit}).`);
    }

    const recommendationMethod = wholesale.pricingBasis === 'wholesale_reference'
      ? 'Admin wholesale reference'
      : wholesale.pricingBasis === 'wholesale_market_data'
        ? 'Wholesale market data'
        : 'Cost-based wholesale estimate';

    res.json({
      commodityId: commodity.id,
      commodityLabel: commodity.label,
      salesType: 'wholesale',
      available: true,
      referencePrice: wholesaleReference ? wholesaleReference.price : null,
      referenceUnit: wholesaleReference ? wholesaleReference.unit : null,
      referenceMarketType: 'wholesale',
      retailRecommendedPrice: retailRefUnitPrice,
      recommendedUnitPrice,
      pricingBasis: wholesale.pricingBasis,
      wholesaleMarketDataAvailable: wholesale.wholesaleMarketDataAvailable,
      wholesaleOrderCount: exactEvidence.wholesaleOrderCount,
      insufficientMarketData: !wholesale.wholesaleMarketDataAvailable,
      priceRange: {
        minimumPrice: roundMoney(recommendedUnitPrice * 0.95),
        maximumPrice: roundMoney(recommendedUnitPrice * 1.05),
        percent: 5,
      },
      marketTrend: null,
      marketTrendPercent: null,
      adjustmentPercent: wholesaleRefUnitPrice ? roundMoney(((recommendedUnitPrice - wholesaleRefUnitPrice) / wholesaleRefUnitPrice) * 100) : null,
      costPrice: wholesale.productionCost,
      handlingCostPerOrder: wholesale.handlingCostPerOrder,
      handlingCostPerUnit: wholesale.handlingCostPerUnit,
      totalCostPerUnit: wholesale.totalCostPerUnit,
      breakEvenCost: wholesale.breakEvenCost,
      targetProfitMargin: wholesale.targetProfitMargin,
      moq: wholesale.moq,
      moqExceedsStock: wholesale.moqExceedsStock,
      minimumOrderTotal: wholesale.minimumOrderTotal,
      estimatedStockValue: milliQuantity > 0n ? formatCents(totalCents) : null,
      totalExpenses: wholesale.totalExpenses,
      estimatedGrossProfit: wholesale.estimatedGrossProfit,
      estimatedProfit: wholesale.estimatedProfitPerUnit,
      profitMargin: wholesale.achievedProfitMargin,
      isBelowBreakEven: wholesale.isRecommendedBelowBreakEven,
      isEnteredPriceBelowBreakEven: wholesale.isEnteredPriceBelowBreakEven,
      missingInputs: wholesale.missingInputs,
      belowMarketFloor: false,
      aboveMarketCeiling: false,
      whyThisPrice: whyParts.join(' '),
      wholesaleVsRetailExplanation,
      formulaLines,
      dataSource: wholesaleReference?.source || null,
      dataUpdatedAt: wholesaleReference?.effectiveDate || null,
      aiSummary: null,
      aiRecommendation: null,
      recommendationMethod,
      requestedUnit,
      estimatedTotal: milliQuantity > 0n ? formatCents(totalCents) : null,
      source: wholesaleReference?.source || null,
      effectiveDate: wholesaleReference?.effectiveDate || null,
      referenceYear: wholesaleReference?.year || null,
      supportingReference: wholesaleReference?.supportingReference || null,
    });
    return;
  }

  const { commodity, reference } = await resolveEffectiveReference(req.params.commodityId, { marketType: 'retail' });

  if (!reference) {
    res.json({
      commodityId: commodity.id,
      commodityLabel: commodity.label,
      salesType: 'retail',
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
      salesType: 'retail',
      available: false,
      reason: 'unit_mismatch',
      referencePrice: reference.price,
      referenceUnit: reference.unit,
      referenceMarketType: reference.marketType || 'retail',
      source: reference.source,
      effectiveDate: reference.effectiveDate,
      recommendedUnitPrice: null,
      estimatedTotal: null,
    });
    return;
  }

  const exactEvidence = await getExactDemandSupplyEvidence(productName, requestedUnit);
  const resolvedDemandLevel = demandEvidenceFromText(demandLevel) || exactEvidence.demandLevel;
  const resolvedSupplyLevel = demandEvidenceFromText(supplyLevel) || exactEvidence.supplyLevel;
  const trendEvidencePercent = marketTrendPercent != null && marketTrendPercent !== ''
    ? Number(marketTrendPercent)
    : trendPercentFromPoints(reference.trendPoints);

  const retailDynamic = calculateDynamicRecommendation({
    marketReference: marketReferencePrice,
    requestedUnit,
    costPrice: cost,
    marketTrendPercent: Number.isFinite(trendEvidencePercent) ? roundMoney(trendEvidencePercent) : null,
    exactAverage,
    exactTrend: historicalTrend,
    demandLevel: resolvedDemandLevel,
    supplyLevel: resolvedSupplyLevel,
  });
  if (!retailDynamic) {
    res.json({
      commodityId: commodity.id,
      commodityLabel: commodity.label,
      salesType: 'retail',
      available: false,
      referencePrice: null,
      recommendedUnitPrice: null,
      estimatedTotal: null,
    });
    return;
  }

  const recommendedUnitPrice = retailDynamic.recommendedUnitPrice;
  const profit = retailDynamic.profit;
  const aiInsight = productName
    ? await generateProductPriceInsight({
        productName,
        unit: requestedUnit,
        orderCount: Number(req.body?.orderCount || 0),
        averagePrice: exactAverage ?? retailDynamic.marketReference,
        lowestPrice: historicalLowest == null ? retailDynamic.marketReference : Number(historicalLowest),
        highestPrice: historicalHighest == null ? retailDynamic.marketReference : Number(historicalHighest),
        trend: retailDynamic.marketTrend,
        costPrice: retailDynamic.costPrice,
        recommendedPrice: recommendedUnitPrice,
        estimatedProfit: profit,
        estimatedMargin: retailDynamic.margin,
      })
    : null;

  const priceCents = BigInt(toPriceCents(recommendedUnitPrice, 'Recommended price'));
  const totalCents = (priceCents * milliQuantity + 500n) / 1000n;
  if (totalCents > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new ApiError('Quantity is too large to calculate an accurate total.', 400);
  }
  const isEnteredPriceBelowBreakEven = parsedSellingPrice != null
    && retailDynamic.breakEvenCost != null
    && parsedSellingPrice < retailDynamic.breakEvenCost;

  res.json({
    commodityId: commodity.id,
    commodityLabel: commodity.label,
    salesType: 'retail',
    available: true,
    referencePrice: reference.price,
    referenceUnit: reference.unit,
    retailRecommendedPrice: recommendedUnitPrice,
    recommendedUnitPrice,
    pricingBasis: 'retail_reference',
    wholesaleMarketDataAvailable: false,
    insufficientMarketData: retailDynamic.marketTrend === 'Insufficient trend data',
    priceRange: {
      minimumPrice: roundMoney(retailDynamic.belowMarketFloor ? recommendedUnitPrice : recommendedUnitPrice * 0.95),
      maximumPrice: roundMoney(retailDynamic.aboveMarketCeiling ? recommendedUnitPrice : recommendedUnitPrice * 1.05),
      percent: 5,
    },
    marketTrend: retailDynamic.marketTrend,
    marketTrendPercent: retailDynamic.marketTrendPercent,
    adjustmentPercent: retailDynamic.adjustmentPercent,
    costPrice: retailDynamic.costPrice,
    breakEvenCost: retailDynamic.breakEvenCost,
    estimatedProfit: profit,
    profitMargin: retailDynamic.margin,
    isBelowBreakEven: retailDynamic.isBelowBreakEven,
    isEnteredPriceBelowBreakEven,
    belowMarketFloor: retailDynamic.belowMarketFloor,
    aboveMarketCeiling: retailDynamic.aboveMarketCeiling,
    whyThisPrice: retailDynamic.why,
    wholesaleVsRetailExplanation: null,
    formulaLines: retailDynamic.formulaLines,
    dataSource: reference.source,
    dataUpdatedAt: reference.effectiveDate,
    aiSummary: aiInsight?.summary || null,
    aiRecommendation: aiInsight?.recommendation || null,
    recommendationMethod: aiInsight ? 'Gemini-assisted, evidence-validated' : 'Rule-based, evidence-validated',
    requestedUnit,
    estimatedTotal: milliQuantity > 0n ? formatCents(totalCents) : null,
    source: reference.source,
    effectiveDate: reference.effectiveDate,
    referenceYear: reference.year,
    supportingReference: reference.supportingReference,
  });
}
