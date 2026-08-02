import { supabaseAdmin } from '../lib/supabaseClient.js';
import { ApiError } from '../lib/ApiError.js';
import { getWeatherForMunicipality } from '../lib/weatherService.js';
import { matchCommodity } from '../lib/marketCommodities.js';
import { fetchAnnualPriceTrend } from '../lib/psaPriceService.js';
import { generateForecastInsights } from '../lib/geminiService.js';
import {
  inferHarvestSeason, computeWeatherImpact, computeConfidence, computeSupplyLevel,
  computeSeasonalImpact, bestTimeToHarvestLabel, computeForecastDemand, computeStatus,
  computeRiskLevel, buildRecommendation,
} from '../lib/forecastEngine.js';
import {
  FORECAST_PERIODS, FORECAST_PERIOD_LABELS, resolveForecastDate,
  computeOrderTrendDailyRate, computePsaTrendDailyRate, computeDemandTrendDailyRate,
  computePriceVolatilityPercent, computeDemandVolatilityPercent,
  demandSignalToLevel, buildForecastSeries, buildPriceSeasonalFn, buildDemandSeasonalFn,
  buildWeatherAdjustmentFn, findBestSellingDate, buildCurveDayMarks,
  PRICE_SERIES_BOUNDS, DEMAND_SERIES_BOUNDS, DEMAND_DAILY_NUDGE_BY_SIGNAL,
  MAX_TOTAL_DAILY_DRIFT_RATE, MAX_DEMAND_TREND_DAILY_RATE_BOUND,
} from '../lib/priceForecastEngine.js';

// In-memory only — no DB table backs this (see schema.sql's removed forecast_predictions:
// it was keyed by a single product_id, which doesn't fit a crop-aggregated-across-all-
// farmers forecast). Resets on every server restart/deploy; just enough to avoid re-querying
// Supabase/PSA on every rapid poll/filter tweak.
const LIST_CACHE_TTL_MS = 60 * 1000;
const listCache = new Map();

// Longer TTL specifically for the crop-detail endpoint, which spends a Gemini call — mirrors
// the old forecast_predictions table's 6h reuse window, just in-memory instead of persisted.
const DETAIL_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const detailCache = new Map();

function getCached(cache, key, ttlMs) {
  const entry = cache.get(key);
  if (!entry || Date.now() - entry.cachedAt > ttlMs) return null;
  return entry.data;
}

function setCached(cache, key, data) {
  cache.set(key, { data, cachedAt: Date.now() });
}

const EXCLUDED_ORDER_STATUSES = ['rejected', 'cancelled'];
// Demand-per-listing at or above this reads as "supply is stretched."
const HIGH_DEMAND_PER_LISTING = 10;
// Widened from the old 90-day window so a crop with real order history further back still
// shows a fuller historical chart when that history genuinely exists — never fabricated,
// just a longer real lookback.
const DEFAULT_HISTORY_DAYS_BACK = 180;
// Below this many distinct real order dates, the historical chart also weaves in real PSA
// annual reference points (see below) rather than staying a near-empty 1-2 dot chart.
const MIN_ORDER_HISTORY_POINTS_FOR_CHART = 5;

// Grouped by crop NAME (e.g. "Tomato"), not the broader ~19-item category taxonomy — a
// forecast is naturally per-crop. Names are farmer-entered free text, so the grouping key is
// normalized (trimmed/lowercased) while the display name keeps a readable Title Case.
function normalizeCropKey(name) {
  return String(name || '').trim().toLowerCase();
}

function titleCaseCropName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function validatePeriod(period) {
  if (!FORECAST_PERIODS.includes(period)) throw new ApiError('Unknown forecast period.', 400);
}

// The shared per-crop computation both getDemandForecast (list) and getCropForecastDetail
// (drill-down) run — every field here traces to real order/listing/weather/PSA data (see
// forecastEngine.js and priceForecastEngine.js); Gemini never touches any of it. Returns
// `forecast` (the public shape both endpoints send to the client) separately from
// `internals` (the full day-by-day series + raw PSA points) — getCropForecastDetail needs
// the latter to build its curve/chart output without recomputing the same series twice;
// getDemandForecast's list view only ever needs `forecast`.
async function computeCropForecast(entry, {
  daysAhead, today, weather, daysBack, windowStartMs, windowEndMs,
}) {
  const currentPrice = entry.priceSampleCount ? entry.priceSampleTotal / entry.priceSampleCount : null;
  const demandPerListing = entry.quantityOrdered / Math.max(entry.activeListings, 1);
  let signal = 'none';
  if (entry.quantityOrdered > 0) {
    signal = entry.activeListings === 0 || demandPerListing >= HIGH_DEMAND_PER_LISTING ? 'opportunity' : 'steady';
  }
  const harvestSeason = inferHarvestSeason(entry.activeListings);

  const commodity = matchCommodity(entry.crop);
  const psaPoints = commodity ? await fetchAnnualPriceTrend(commodity.id, 5) : [];

  const orderTrendDailyRate = computeOrderTrendDailyRate(entry.priceHistory, windowStartMs, windowEndMs);
  const psaTrendDailyRate = computePsaTrendDailyRate(psaPoints);
  const demandTrendDailyRate = computeDemandTrendDailyRate(entry.demandHistory, windowStartMs, windowEndMs);

  // Averaging total quantity over the full `daysBack` lookback dilutes the rate whenever
  // orders don't span the whole window (e.g. a burst of orders 2-3 weeks ago) — dividing by
  // the real active order-span instead keeps the "current" rate honestly close to what the
  // historical chart's own real daily totals actually look like, not artificially flattened.
  const orderTimestamps = entry.demandHistory.map((point) => point.createdAtMs);
  const activeSpanDays = orderTimestamps.length >= 2
    ? Math.max(1, (Math.max(...orderTimestamps) - Math.min(...orderTimestamps)) / 86400000)
    : daysBack;
  const currentDemandRate = entry.quantityOrdered / activeSpanDays;

  const supplyLevel = computeSupplyLevel(entry.activeListings);
  const weatherImpact = computeWeatherImpact(weather);
  const seasonalImpact = computeSeasonalImpact(harvestSeason);
  const bestTimeToHarvest = bestTimeToHarvestLabel(harvestSeason);
  const confidence = computeConfidence({
    orderCount: entry.orderCount,
    activeListings: entry.activeListings,
    hasWeather: Boolean(weather),
    hasTrendData: entry.priceHistory.length >= 4,
    daysAhead,
  });
  const status = computeStatus(signal, weather);

  const priceVolatilityPercent = computePriceVolatilityPercent(entry.priceHistory);
  const demandVolatilityPercent = computeDemandVolatilityPercent(entry.demandHistory);

  // A real average of this crop's own recorded order prices (not the forecast) — computed
  // up front so it can double as the forecast's starting point when there's no *active*
  // listing to price from (see priceBaselineValue below), not just as the Summary panel's
  // separate "Average Price" card.
  const historicalAveragePrice = entry.priceHistory.length
    ? Math.round((entry.priceHistory.reduce((sum, point) => sum + point.unitPrice, 0) / entry.priceHistory.length) * 100) / 100
    : null;
  // currentPrice is null exactly when nobody currently has this crop actively listed — still
  // a real, honest state, but not the end of the line: a forecast (and the "Current Price"
  // display everywhere it's shown) can fall back to this crop's real historical order prices,
  // and after that to the farmer's own last-listed price even if that specific listing is no
  // longer active (out of stock, or a price DTI declined — see buildCropMap above). A price
  // the farmer set from their own real cost-per-unit is still a genuine signal, not an
  // invented one, and far more useful than leaving every forecast card blank for a crop that
  // does have real listing history behind it.
  const priceBaselineValue = currentPrice ?? historicalAveragePrice ?? entry.lastListedPrice;
  const priceBasis = currentPrice != null
    ? 'listing'
    : historicalAveragePrice != null ? 'historical' : (entry.lastListedPrice != null ? 'farmer-listed' : null);

  let priceDailyDrift = orderTrendDailyRate + psaTrendDailyRate + (DEMAND_DAILY_NUDGE_BY_SIGNAL[signal] || 0);
  priceDailyDrift = Math.max(-MAX_TOTAL_DAILY_DRIFT_RATE, Math.min(MAX_TOTAL_DAILY_DRIFT_RATE, priceDailyDrift));
  const demandDailyDrift = Math.max(
    -MAX_DEMAND_TREND_DAILY_RATE_BOUND,
    Math.min(MAX_DEMAND_TREND_DAILY_RATE_BOUND, demandTrendDailyRate),
  );

  const dayMarks = buildCurveDayMarks(daysAhead);
  const weatherAdjustmentFn = buildWeatherAdjustmentFn(weather);

  // Never a flat line, even when priceDailyDrift is 0 (no detectable directional trend) —
  // the seasonal + volatility-scaled noise components inside buildForecastSeries still move
  // the curve day to day (see priceForecastEngine.js's own top-of-file explanation).
  const priceSeries = priceBaselineValue != null ? buildForecastSeries({
    baseValue: priceBaselineValue,
    dayMarks,
    dailyDrift: priceDailyDrift,
    volatilityPercent: priceVolatilityPercent,
    seasonalFn: buildPriceSeasonalFn({ today, harvestSeason, totalDays: daysAhead || 1 }),
    weatherAdjustmentFn,
    seedKey: `price:${entry.crop}`,
    baseConfidence: confidence,
    maxTotalChangePercent: PRICE_SERIES_BOUNDS.maxTotalChangePercent,
    metricLabel: 'price',
    demandSignal: signal,
    harvestSeason,
    weatherImpact,
  }) : [];

  const demandSeries = buildForecastSeries({
    baseValue: currentDemandRate,
    dayMarks,
    dailyDrift: demandDailyDrift,
    volatilityPercent: demandVolatilityPercent,
    seasonalFn: buildDemandSeasonalFn({ today }),
    seedKey: `demand:${entry.crop}`,
    baseConfidence: confidence,
    maxTotalChangePercent: DEMAND_SERIES_BOUNDS.maxTotalChangePercent,
    metricLabel: 'demand',
    demandSignal: signal,
    harvestSeason,
    weatherImpact,
  });

  const lastPricePoint = priceSeries[priceSeries.length - 1] || null;
  const forecastPrice = lastPricePoint?.value ?? null;
  const expectedChangePercent = lastPricePoint?.changePercent ?? null;
  const marketTrend = lastPricePoint?.trend || 'stable';
  const bestSellingDate = priceSeries.length ? findBestSellingDate(priceSeries, today) : today;

  const lastDemandPoint = demandSeries[demandSeries.length - 1] || null;
  const demandTrend = lastDemandPoint?.trend || 'stable';

  // Against referencePrice (priceBaselineValue), not the stricter currentPrice — forecastPrice
  // itself is already projected from that same baseline (see priceSeries above), so using the
  // narrower currentPrice here just meant this stayed blank any time Current/Forecast Price
  // were already showing real historical- or farmer-listed-fallback numbers right next to it.
  const expectedProfit = forecastPrice != null && priceBaselineValue != null
    ? Math.round((forecastPrice - priceBaselineValue) * 100) / 100
    : null;

  const riskLevel = computeRiskLevel(priceVolatilityPercent, confidence);
  const priceHigh = priceSeries.length ? Math.max(...priceSeries.map((point) => point.value)) : null;
  const priceLow = priceSeries.length ? Math.min(...priceSeries.map((point) => point.value)) : null;

  // Real, most-common unit among this crop's active listings — averaging price across
  // farmers only means something when it's paired with the unit that price is actually in.
  const unitCounts = new Map();
  entry.units.forEach((unit) => unitCounts.set(unit, (unitCounts.get(unit) || 0) + 1));
  const unit = [...unitCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  const recommendation = buildRecommendation({
    crop: entry.crop, signal, harvestSeason, forecastPrice, currentPrice,
  });

  const forecast = {
    crop: entry.crop,
    category: entry.category,
    unit,
    imageUrl: entry.imageUrl,
    currentPrice,
    // The actual starting value the forecast/table price displays are built from — same as
    // currentPrice when there's a real active listing, otherwise the historical-average or
    // farmer-last-listed fallback (see priceBaselineValue above and priceBasis below). Use
    // this, not raw currentPrice, wherever a "current/reference price" is shown to a farmer —
    // currentPrice itself stays reserved for things that specifically need to know whether a
    // *live* listing exists (e.g. expectedProfit, which only makes sense against one).
    referencePrice: priceBaselineValue,
    activeListings: entry.activeListings,
    orderCount: entry.orderCount,
    quantityOrdered: entry.quantityOrdered,
    signal,
    currentDemand: demandSignalToLevel(signal),
    forecastDemand: computeForecastDemand(signal, harvestSeason),
    demandTrend,
    currentDemandRate,
    forecastDemandRate: lastDemandPoint?.value ?? null,
    forecastPrice,
    // 'listing' when currentPrice (a real active listing) drove the forecast, 'historical'
    // when it's built from this crop's real past order prices instead, 'farmer-listed' when
    // it falls back further to a farmer's own last-listed price (a listing that's since gone
    // inactive), null when there's no real price data of any kind — lets the frontend caption
    // referencePrice accordingly instead of implying a live listing price exists when it doesn't.
    priceBasis,
    expectedChangePercent,
    marketTrend,
    priceVolatilityPercent,
    demandVolatilityPercent,
    riskLevel,
    priceHigh,
    priceLow,
    historicalAveragePrice,
    supplyLevel,
    weatherImpact,
    seasonalImpact,
    harvestSeason,
    bestTimeToHarvest,
    bestTimeToSell: toIsoDate(bestSellingDate),
    expectedProfit,
    confidence,
    status,
    recommendation,
    lastUpdated: new Date().toISOString(),
  };

  return { forecast, internals: { priceSeries, demandSeries, psaPoints } };
}

// Groups real active listings + real recent orders into one entry per crop — shared shape
// consumed by both endpoints below.
function buildCropMap(products, orders, { hasFilter, productIdSet, productById }) {
  const cropMap = new Map();
  const ensureCrop = (key, displayName, categoryName) => {
    if (!cropMap.has(key)) {
      cropMap.set(key, {
        crop: displayName,
        category: categoryName || null,
        priceSampleTotal: 0,
        priceSampleCount: 0,
        activeListings: 0,
        orderCount: 0,
        quantityOrdered: 0,
        priceHistory: [],
        demandHistory: [],
        units: [],
        imageUrl: null,
        lastListedPrice: null,
        lastListedPriceAt: 0,
      });
    }
    return cropMap.get(key);
  };

  products.filter((product) => product.status === 'active').forEach((product) => {
    const key = normalizeCropKey(product.name);
    const entry = ensureCrop(key, titleCaseCropName(product.name), product.category);
    entry.activeListings += 1;
    entry.priceSampleTotal += Number(product.price) || 0;
    entry.priceSampleCount += 1;
    if (product.unit) entry.units.push(product.unit);
    // First real listing photo found for this crop — one representative image, not a
    // fabricated/stock one; crops with no photographed listing simply stay null (the UI
    // falls back to an icon).
    if (!entry.imageUrl && product.image_url) entry.imageUrl = product.image_url;
  });

  // Every listing a farmer has ever created for this crop, active or not — a farmer's own
  // real, cost-informed price (see ProductForm.jsx's "Recommended price" from cost per unit)
  // is still a genuine price signal even once the listing goes inactive (out of stock, or a
  // price DTI later declined — see declinePriceReview), so it can still back a forecast when
  // there's no active listing or completed order to price from instead. Whichever listing was
  // last updated wins, as the farmer's most recent word on what this crop is worth.
  products.forEach((product) => {
    const price = Number(product.price);
    if (!price) return;
    const key = normalizeCropKey(product.name);
    const entry = ensureCrop(key, titleCaseCropName(product.name), product.category);
    const updatedAtMs = new Date(product.updated_at || product.created_at || 0).getTime();
    if (updatedAtMs >= entry.lastListedPriceAt) {
      entry.lastListedPrice = price;
      entry.lastListedPriceAt = updatedAtMs;
    }
  });

  orders.filter((order) => (
    !EXCLUDED_ORDER_STATUSES.includes(order.status) && (!hasFilter || productIdSet.has(order.product_id))
  )).forEach((order) => {
    const product = productById.get(order.product_id);
    const key = normalizeCropKey(product?.name || order.product_name);
    const entry = ensureCrop(key, titleCaseCropName(product?.name || order.product_name), product?.category);
    entry.orderCount += 1;
    const quantity = Number(order.quantity) || 0;
    entry.quantityOrdered += quantity;
    if (order.unit_price != null && order.created_at) {
      const createdAtMs = new Date(order.created_at).getTime();
      entry.priceHistory.push({ createdAtMs, unitPrice: Number(order.unit_price) });
      entry.demandHistory.push({ createdAtMs, quantity });
    }
  });

  return cropMap;
}

// GET /api/forecast/demand?category=&municipality=&daysBack=&period=&customDate=
//
// Real historical orders + current active listings from Supabase, grouped per crop, plus
// real current/forecast weather (OpenWeatherMap) and real PSA reference prices, run through
// the deterministic trend-projection engine to produce every field the merged Demand
// Forecast dashboard needs, at whichever horizon `period` selects.
export async function getDemandForecast(req, res) {
  const category = String(req.query.category || '');
  const municipality = String(req.query.municipality || '');
  const daysBack = Number(req.query.daysBack) > 0 ? Number(req.query.daysBack) : DEFAULT_HISTORY_DAYS_BACK;
  const period = String(req.query.period || '7_days');
  validatePeriod(period);
  const customDate = period === 'custom' ? String(req.query.customDate || '') : null;
  // No location filter selected -> default to the signed-in farmer's own municipality, same
  // "show me my own area first" reasoning as the rest of the app.
  const weatherMunicipality = municipality || req.profile.municipality || '';
  const cacheKey = `${category}|${municipality}|${period}|${daysBack}|${weatherMunicipality}|${customDate}`;

  const cached = getCached(listCache, cacheKey, LIST_CACHE_TTL_MS);
  if (cached) {
    res.json(cached);
    return;
  }

  let productsQuery = supabaseAdmin.from('products').select('id, name, category, price, unit, location, status, image_url, created_at, updated_at');
  if (category) productsQuery = productsQuery.eq('category', category);
  if (municipality) productsQuery = productsQuery.eq('location', municipality);
  const { data: products, error: productsError } = await productsQuery;
  if (productsError) throw new ApiError(productsError.message, 400);

  const productById = new Map(products.map((product) => [product.id, product]));
  const productIdSet = new Set(products.map((product) => product.id));
  const hasFilter = Boolean(category || municipality);

  const windowStartMs = Date.now() - daysBack * 24 * 60 * 60 * 1000;
  const windowEndMs = Date.now();
  const { data: recentOrders, error: ordersError } = await supabaseAdmin
    .from('orders')
    .select('product_id, product_name, quantity, unit_price, status, created_at')
    .gte('created_at', new Date(windowStartMs).toISOString());
  if (ordersError) throw new ApiError(ordersError.message, 400);

  const cropMap = buildCropMap(products, recentOrders, { hasFilter, productIdSet, productById });

  const weather = await getWeatherForMunicipality(weatherMunicipality);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const forecastDate = resolveForecastDate(period, today, customDate);
  const daysAhead = Math.round((forecastDate.getTime() - today.getTime()) / 86400000);

  const entries = [...cropMap.values()].filter((entry) => entry.activeListings > 0 || entry.orderCount > 0);
  const results = (await Promise.all(entries.map((entry) => computeCropForecast(entry, {
    daysAhead, today, weather, daysBack, windowStartMs, windowEndMs,
  })))).map(({ forecast }, index) => ({
    ...forecast,
    demandPerListing: entries[index].quantityOrdered / Math.max(entries[index].activeListings, 1),
  })).sort((a, b) => b.quantityOrdered - a.quantityOrdered);

  const response = {
    weather,
    period,
    periodLabel: FORECAST_PERIOD_LABELS[period],
    periods: FORECAST_PERIODS.map((value) => ({ value, label: FORECAST_PERIOD_LABELS[value] })),
    generatedAt: new Date().toISOString(),
    crops: results,
  };
  setCached(listCache, cacheKey, response);
  res.json(response);
}

// GET /api/forecast/demand/:cropName?period=&municipality=&customDate=
//
// Drill-down for one crop: the same real aggregation as the list endpoint scoped to a single
// crop name, plus the full price/demand confidence-banded curves (for the trend charts) and
// a Gemini-written summary/recommendation of the already-computed numbers (null, honestly,
// if GEMINI_API_KEY isn't configured).
export async function getCropForecastDetail(req, res) {
  const cropName = String(req.params.cropName || '').trim();
  if (!cropName) throw new ApiError('Crop name is required.', 400);
  const period = String(req.query.period || '7_days');
  validatePeriod(period);
  const customDate = period === 'custom' ? String(req.query.customDate || '') : null;
  const municipality = String(req.query.municipality || '');
  const weatherMunicipality = municipality || req.profile.municipality || '';
  const daysBack = DEFAULT_HISTORY_DAYS_BACK;

  const cacheKey = `${normalizeCropKey(cropName)}|${period}|${municipality}|${customDate}`;
  const cached = getCached(detailCache, cacheKey, DETAIL_CACHE_TTL_MS);
  if (cached) {
    res.json(cached);
    return;
  }

  let productsQuery = supabaseAdmin.from('products').select('id, name, category, price, unit, location, status, image_url, created_at, updated_at');
  if (municipality) productsQuery = productsQuery.eq('location', municipality);
  const { data: products, error: productsError } = await productsQuery;
  if (productsError) throw new ApiError(productsError.message, 400);

  const targetKey = normalizeCropKey(cropName);
  const matchingProducts = products.filter((product) => normalizeCropKey(product.name) === targetKey);
  const matchingIds = new Set(matchingProducts.map((product) => product.id));
  const productById = new Map(matchingProducts.map((product) => [product.id, product]));

  const windowStartMs = Date.now() - daysBack * 24 * 60 * 60 * 1000;
  const windowEndMs = Date.now();
  const { data: recentOrders, error: ordersError } = await supabaseAdmin
    .from('orders')
    .select('product_id, product_name, quantity, unit_price, status, created_at')
    .gte('created_at', new Date(windowStartMs).toISOString());
  if (ordersError) throw new ApiError(ordersError.message, 400);
  const relevantOrders = recentOrders.filter((order) => (
    matchingIds.has(order.product_id) || normalizeCropKey(order.product_name) === targetKey
  ));

  const cropMap = buildCropMap(matchingProducts, relevantOrders, {
    hasFilter: true, productIdSet: matchingIds, productById,
  });
  const entry = cropMap.get(targetKey);
  if (!entry) throw new ApiError('Crop not found.', 404);

  const weather = await getWeatherForMunicipality(weatherMunicipality);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const forecastDate = resolveForecastDate(period, today, customDate);
  const daysAhead = Math.round((forecastDate.getTime() - today.getTime()) / 86400000);

  const { forecast, internals } = await computeCropForecast(entry, {
    daysAhead, today, weather, daysBack, windowStartMs, windowEndMs,
  });

  const dayMarkToDate = (dayOffset) => {
    const date = new Date(today);
    date.setDate(date.getDate() + dayOffset);
    return toIsoDate(date);
  };

  const forecastCurve = internals.priceSeries.map((point) => ({
    date: dayMarkToDate(point.dayOffset),
    price: point.value,
    upper: point.upper,
    lower: point.lower,
    confidence: point.confidence,
    changePercent: point.changePercent,
    reason: point.reason,
  }));

  const demandForecastCurve = internals.demandSeries.map((point) => ({
    date: dayMarkToDate(point.dayOffset),
    volume: point.value,
    upper: point.upper,
    lower: point.lower,
    confidence: point.confidence,
    changePercent: point.changePercent,
    reason: point.reason,
  }));

  const historicalChart = entry.priceHistory.map((point) => ({
    date: toIsoDate(new Date(point.createdAtMs)),
    price: point.unitPrice,
  }));

  // Weaves in real PSA annual reference points as supplementary historical context whenever
  // this crop's own real order history is thin — never fabricated, just a second real
  // published source (see psaPriceService.js) so the chart isn't just 1-2 dots for a crop
  // with few completed orders. Marked source: 'psa' so the frontend can render them distinctly
  // from real order-derived points.
  const uniqueOrderDates = new Set(historicalChart.map((point) => point.date));
  const psaHistoricalPoints = uniqueOrderDates.size < MIN_ORDER_HISTORY_POINTS_FOR_CHART
    ? internals.psaPoints
      .filter((point) => point.price != null)
      .map((point) => ({ date: `${point.year}-01-01`, price: point.price, source: 'psa' }))
    : [];

  // Bucketed by week (not day): a raw day's order total can spike far above the smooth
  // per-day RATE the forecast curve projects (one busy order day vs. an averaged-out daily
  // rate), which made the two series look discontinuous even though both were real. A
  // weekly total / 7 is still real, un-fabricated data — just resampled onto the same
  // "average units/day" footing the forecast side already uses.
  const demandByWeek = new Map();
  entry.demandHistory.forEach((point) => {
    const daysSinceStart = Math.floor((point.createdAtMs - windowStartMs) / 86400000);
    const weekStartMs = windowStartMs + Math.floor(daysSinceStart / 7) * 7 * 86400000;
    const key = toIsoDate(new Date(weekStartMs));
    demandByWeek.set(key, (demandByWeek.get(key) || 0) + point.quantity);
  });
  const demandHistoricalChart = [...demandByWeek.entries()]
    .map(([date, total]) => ({ date, volume: Math.round((total / 7) * 100) / 100 }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  const insights = await generateForecastInsights({
    cropName: entry.crop,
    municipality: weatherMunicipality,
    periodLabel: FORECAST_PERIOD_LABELS[period],
    currentPrice: forecast.currentPrice,
    predictedPrice: forecast.forecastPrice,
    changePercent: forecast.expectedChangePercent,
    trend: forecast.marketTrend,
    demandLevel: forecast.forecastDemand,
    demandTrend: forecast.demandTrend,
    supplyLevel: forecast.supplyLevel,
    seasonalImpact: forecast.seasonalImpact,
    weatherImpact: forecast.weatherImpact,
    expectedProfit: forecast.expectedProfit,
    bestTimeToHarvest: forecast.bestTimeToHarvest,
    bestTimeToSell: forecast.bestTimeToSell,
    unit: forecast.unit || 'unit',
  });

  const response = {
    ...forecast,
    period,
    periodLabel: FORECAST_PERIOD_LABELS[period],
    aiSummary: insights?.summary || null,
    aiRecommendation: insights?.recommendation || null,
    historicalChart: [...psaHistoricalPoints, ...historicalChart].sort((a, b) => (a.date < b.date ? -1 : 1)),
    forecastCurve,
    demandHistoricalChart,
    demandForecastCurve,
  };
  setCached(detailCache, cacheKey, response);
  res.json(response);
}
