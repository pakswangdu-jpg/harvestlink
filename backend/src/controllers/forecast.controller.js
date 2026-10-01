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





const LIST_CACHE_TTL_MS = 60 * 1000;
const listCache = new Map();



const DETAIL_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const DETAIL_FALLBACK_CACHE_TTL_MS = 60 * 1000;
const detailCache = new Map();

function getCached(cache, key, ttlMs) {
  const entry = cache.get(key);
  if (!entry || Date.now() - entry.cachedAt >= (entry.ttlMs ?? ttlMs)) return null;
  return entry.data;
}

function setCached(cache, key, data, ttlMs) {
  cache.set(key, { data, cachedAt: Date.now(), ttlMs });
}

const EXCLUDED_ORDER_STATUSES = ['rejected', 'cancelled'];

const HIGH_DEMAND_PER_LISTING = 10;



const DEFAULT_HISTORY_DAYS_BACK = 180;


const MIN_ORDER_HISTORY_POINTS_FOR_CHART = 5;




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





  const historicalAveragePrice = entry.priceHistory.length
    ? Math.round((entry.priceHistory.reduce((sum, point) => sum + point.unitPrice, 0) / entry.priceHistory.length) * 100) / 100
    : null;








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





  const expectedProfit = forecastPrice != null && priceBaselineValue != null
    ? Math.round((forecastPrice - priceBaselineValue) * 100) / 100
    : null;

  const riskLevel = computeRiskLevel(priceVolatilityPercent, confidence);
  const priceHigh = priceSeries.length ? Math.max(...priceSeries.map((point) => point.value)) : null;
  const priceLow = priceSeries.length ? Math.min(...priceSeries.map((point) => point.value)) : null;



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



    if (!entry.imageUrl && product.image_url) entry.imageUrl = product.image_url;
  });







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







export async function getDemandForecast(req, res) {
  const category = String(req.query.category || '');
  const municipality = String(req.query.municipality || '');
  const daysBack = Number(req.query.daysBack) > 0 ? Number(req.query.daysBack) : DEFAULT_HISTORY_DAYS_BACK;
  const period = String(req.query.period || '7_days');
  validatePeriod(period);
  const customDate = period === 'custom' ? String(req.query.customDate || '') : null;


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






  const uniqueOrderDates = new Set(historicalChart.map((point) => point.date));
  const psaHistoricalPoints = uniqueOrderDates.size < MIN_ORDER_HISTORY_POINTS_FOR_CHART
    ? internals.psaPoints
      .filter((point) => point.price != null)
      .map((point) => ({ date: `${point.year}-01-01`, price: point.price, source: 'psa' }))
    : [];






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
  setCached(detailCache, cacheKey, response, insights ? DETAIL_CACHE_TTL_MS : DETAIL_FALLBACK_CACHE_TTL_MS);
  res.json(response);
}
