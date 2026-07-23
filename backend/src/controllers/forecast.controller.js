import { supabaseAdmin } from '../lib/supabaseClient.js';
import { ApiError } from '../lib/ApiError.js';
import { getWeatherForMunicipality } from '../lib/weatherService.js';
import { matchCommodity } from '../lib/marketCommodities.js';
import { fetchAnnualPriceTrend } from '../lib/psaPriceService.js';
import { generateForecastInsights } from '../lib/geminiService.js';
import {
  inferHarvestSeason, computeWeatherImpact, computeConfidence, computeSupplyLevel,
  computeSeasonalImpact, bestTimeToHarvestLabel, computeForecastDemand, computeStatus, buildRecommendation,
} from '../lib/forecastEngine.js';
import {
  FORECAST_PERIODS, FORECAST_PERIOD_LABELS, resolveForecastDate,
  computeOrderTrendDailyRate, computePsaTrendDailyRate, computeDemandTrendDailyRate,
  demandSignalToLevel, projectPrice, projectDemand, computeBestSellingDate, buildCurveDayMarks,
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
const DEFAULT_HISTORY_DAYS_BACK = 90;

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
// forecastEngine.js and priceForecastEngine.js); Gemini never touches any of it.
async function computeCropForecast(entry, { daysAhead, today, forecastDate, weather, daysBack, windowStartMs, windowEndMs }) {
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

  const priceProjection = projectPrice({
    currentPrice, daysAhead, orderTrendDailyRate, psaTrendDailyRate, demandSignal: signal, weather,
  }) || {};
  const forecastPrice = priceProjection.predictedPrice ?? null;
  const expectedChangePercent = priceProjection.changePercent ?? null;
  const marketTrend = priceProjection.trend || 'stable';

  // Averaging total quantity over the full `daysBack` lookback dilutes the rate whenever
  // orders don't span the whole window (e.g. a burst of orders 2-3 weeks ago) — dividing by
  // the real active order-span instead keeps the "current" rate honestly close to what the
  // historical chart's own real daily totals actually look like, not artificially flattened.
  const orderTimestamps = entry.demandHistory.map((point) => point.createdAtMs);
  const activeSpanDays = orderTimestamps.length >= 2
    ? Math.max(1, (Math.max(...orderTimestamps) - Math.min(...orderTimestamps)) / 86400000)
    : daysBack;
  const currentDemandRate = entry.quantityOrdered / activeSpanDays;
  const demandProjection = projectDemand({ currentVolume: currentDemandRate, daysAhead, demandTrendDailyRate }) || {};
  const demandTrend = demandProjection.trend || 'stable';

  const supplyLevel = computeSupplyLevel(entry.activeListings);
  const weatherImpact = computeWeatherImpact(weather);
  const seasonalImpact = computeSeasonalImpact(harvestSeason);
  const bestTimeToHarvest = bestTimeToHarvestLabel(harvestSeason);
  const bestTimeToSell = computeBestSellingDate(marketTrend, today, forecastDate);
  const expectedProfit = forecastPrice != null && currentPrice != null
    ? Math.round((forecastPrice - currentPrice) * 100) / 100
    : null;
  const confidence = computeConfidence({
    orderCount: entry.orderCount,
    activeListings: entry.activeListings,
    hasWeather: Boolean(weather),
    hasTrendData: entry.priceHistory.length >= 4,
    daysAhead,
  });
  const status = computeStatus(signal, weather);
  const recommendation = buildRecommendation({ crop: entry.crop, signal, harvestSeason, forecastPrice, currentPrice });

  // Real, most-common unit among this crop's active listings — averaging price across
  // farmers only means something when it's paired with the unit that price is actually in.
  const unitCounts = new Map();
  entry.units.forEach((unit) => unitCounts.set(unit, (unitCounts.get(unit) || 0) + 1));
  const unit = [...unitCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  return {
    crop: entry.crop,
    category: entry.category,
    unit,
    imageUrl: entry.imageUrl,
    currentPrice,
    activeListings: entry.activeListings,
    orderCount: entry.orderCount,
    quantityOrdered: entry.quantityOrdered,
    signal,
    currentDemand: demandSignalToLevel(signal),
    forecastDemand: computeForecastDemand(signal, harvestSeason),
    demandTrend,
    currentDemandRate,
    forecastPrice,
    expectedChangePercent,
    marketTrend,
    supplyLevel,
    weatherImpact,
    seasonalImpact,
    harvestSeason,
    bestTimeToHarvest,
    bestTimeToSell: toIsoDate(bestTimeToSell),
    expectedProfit,
    confidence,
    status,
    recommendation,
    lastUpdated: new Date().toISOString(),
  };
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

// GET /api/forecast/demand?category=&municipality=&daysBack=&period=
//
// Real historical orders + current active listings from Supabase, grouped per crop, plus
// real current/forecast weather (OpenWeatherMap) and real PSA reference prices, run through
// the deterministic trend-projection engine to produce every field the merged Demand
// Forecast dashboard needs, at whichever horizon `period` selects.
export async function getDemandForecast(req, res) {
  const category = String(req.query.category || '');
  const municipality = String(req.query.municipality || '');
  const daysBack = Number(req.query.daysBack) > 0 ? Number(req.query.daysBack) : DEFAULT_HISTORY_DAYS_BACK;
  const period = String(req.query.period || '30_days');
  validatePeriod(period);
  // No location filter selected -> default to the signed-in farmer's own municipality, same
  // "show me my own area first" reasoning as the rest of the app.
  const weatherMunicipality = municipality || req.profile.municipality || '';
  const cacheKey = `${category}|${municipality}|${period}|${daysBack}|${weatherMunicipality}`;

  const cached = getCached(listCache, cacheKey, LIST_CACHE_TTL_MS);
  if (cached) {
    res.json(cached);
    return;
  }

  let productsQuery = supabaseAdmin.from('products').select('id, name, category, price, unit, location, status, image_url');
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
  const forecastDate = resolveForecastDate(period, today);
  const daysAhead = Math.round((forecastDate.getTime() - today.getTime()) / 86400000);

  const entries = [...cropMap.values()].filter((entry) => entry.activeListings > 0 || entry.orderCount > 0);
  const results = (await Promise.all(entries.map((entry) => computeCropForecast(entry, {
    daysAhead, today, forecastDate, weather, daysBack, windowStartMs, windowEndMs,
  })))).map((forecast, index) => ({
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

// GET /api/forecast/demand/:cropName?period=&municipality=
//
// Drill-down for one crop: the same real aggregation as the list endpoint scoped to a single
// crop name, plus the full price/demand curves (for the trend charts) and a Gemini-written
// summary/recommendation of the already-computed numbers (null, honestly, if
// GEMINI_API_KEY isn't configured).
export async function getCropForecastDetail(req, res) {
  const cropName = String(req.params.cropName || '').trim();
  if (!cropName) throw new ApiError('Crop name is required.', 400);
  const period = String(req.query.period || '30_days');
  validatePeriod(period);
  const municipality = String(req.query.municipality || '');
  const weatherMunicipality = municipality || req.profile.municipality || '';
  const daysBack = DEFAULT_HISTORY_DAYS_BACK;

  const cacheKey = `${normalizeCropKey(cropName)}|${period}|${municipality}`;
  const cached = getCached(detailCache, cacheKey, DETAIL_CACHE_TTL_MS);
  if (cached) {
    res.json(cached);
    return;
  }

  let productsQuery = supabaseAdmin.from('products').select('id, name, category, price, unit, location, status, image_url');
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
  const forecastDate = resolveForecastDate(period, today);
  const daysAhead = Math.round((forecastDate.getTime() - today.getTime()) / 86400000);

  const forecast = await computeCropForecast(entry, {
    daysAhead, today, forecastDate, weather, daysBack, windowStartMs, windowEndMs,
  });

  const commodity = matchCommodity(entry.crop);
  const psaPoints = commodity ? await fetchAnnualPriceTrend(commodity.id, 5) : [];
  const orderTrendDailyRate = computeOrderTrendDailyRate(entry.priceHistory, windowStartMs, windowEndMs);
  const psaTrendDailyRate = computePsaTrendDailyRate(psaPoints);
  const demandTrendDailyRate = computeDemandTrendDailyRate(entry.demandHistory, windowStartMs, windowEndMs);
  // Reuse the exact same rate computeCropForecast already derived — guarantees the curve's
  // day-0 point and the table row's demandTrend classification agree on the same number.
  const { currentDemandRate } = forecast;

  // Every point on both curves uses the exact same projection math as the final selected-
  // period value — the "curve" is the model's real output at each day, never an
  // interpolation invented for looks (see buildCurveDayMarks's own doc comment).
  const forecastCurve = buildCurveDayMarks(daysAhead).map((dayMark) => {
    const date = new Date(today);
    date.setDate(date.getDate() + dayMark);
    const projection = dayMark === 0
      ? { predictedPrice: forecast.currentPrice }
      : projectPrice({
        currentPrice: forecast.currentPrice, daysAhead: dayMark, orderTrendDailyRate, psaTrendDailyRate,
        demandSignal: forecast.signal, weather,
      });
    return { date: toIsoDate(date), price: projection?.predictedPrice ?? null };
  });

  const demandForecastCurve = buildCurveDayMarks(daysAhead).map((dayMark) => {
    const date = new Date(today);
    date.setDate(date.getDate() + dayMark);
    const projection = dayMark === 0
      ? { predictedVolume: currentDemandRate }
      : projectDemand({ currentVolume: currentDemandRate, daysAhead: dayMark, demandTrendDailyRate });
    return { date: toIsoDate(date), volume: projection?.predictedVolume ?? null };
  });

  const historicalChart = entry.priceHistory.map((point) => ({
    date: toIsoDate(new Date(point.createdAtMs)),
    price: point.unitPrice,
  }));

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
    historicalChart,
    forecastCurve,
    demandHistoricalChart,
    demandForecastCurve,
  };
  setCached(detailCache, cacheKey, response);
  res.json(response);
}
