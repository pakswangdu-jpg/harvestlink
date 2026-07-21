import { supabaseAdmin } from '../lib/supabaseClient.js';
import { ApiError } from '../lib/ApiError.js';
import { getWeatherForMunicipality } from '../lib/weatherService.js';
import {
  buildExplanation, buildRecommendation, computeConfidence, computeForecastDemand,
  computeForecastPrice, computePriceTrend, computeStatus, computeWeatherImpact, inferHarvestSeason,
} from '../lib/forecastEngine.js';

// In-memory only — no new table, per this feature's "no schema changes" constraint.
// Resets on every server restart/deploy; just enough to avoid re-querying Supabase on
// every rapid poll/filter tweak from the same handful of filter combinations.
const CACHE_TTL_MS = 60 * 1000;
const cache = new Map();

function getCached(key) {
  const entry = cache.get(key);
  if (!entry || Date.now() - entry.cachedAt > CACHE_TTL_MS) return null;
  return entry.data;
}

function setCached(key, data) {
  cache.set(key, { data, cachedAt: Date.now() });
}

const EXCLUDED_ORDER_STATUSES = ['rejected', 'cancelled'];
// Demand-per-listing at or above this reads as "supply is stretched" — ported from the
// old client-side heuristic (src/services/demandForecastService.js) this endpoint replaces.
const HIGH_DEMAND_PER_LISTING = 10;

// Grouped by crop NAME (e.g. "Tomato"), not the broader ~19-item category taxonomy — a
// forecast is naturally per-crop, and category is still carried on each row for the Crop
// Category filter. Names are farmer-entered free text, so grouping key is normalized
// (trimmed/lowercased) while the display name keeps a readable Title Case.
function normalizeCropKey(name) {
  return String(name || '').trim().toLowerCase();
}

function titleCaseCropName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

// GET /api/forecast/demand?category=&municipality=&daysBack=90
//
// Real historical orders + current active listings from Supabase, grouped per crop, plus
// real current/forecast weather (OpenWeatherMap) for whichever municipality is in view, run
// through the rule-based engine in forecastEngine.js to produce Forecast Price, Confidence
// Score, Harvest Season, Forecast Demand, Weather Impact, a recommendation, and a plain-
// language explanation for every crop — never "Pending" as long as the crop has at least
// one active listing or recent order (which every row here already does, by construction).
export async function getDemandForecast(req, res) {
  const category = String(req.query.category || '');
  const municipality = String(req.query.municipality || '');
  const daysBack = Number(req.query.daysBack) > 0 ? Number(req.query.daysBack) : 90;
  // No location filter selected -> default to the signed-in farmer's own municipality, same
  // "show me my own area first" reasoning as the rest of the app (e.g. BuyerDashboard's
  // nearbyFarmers). getWeatherForMunicipality itself falls back further to
  // DEFAULT_MUNICIPALITY for any name outside the known coordinate table.
  const weatherMunicipality = municipality || req.profile.municipality || '';
  const cacheKey = `${category}|${municipality}|${daysBack}|${weatherMunicipality}`;

  const cached = getCached(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

  let productsQuery = supabaseAdmin.from('products').select('id, name, category, price, location, status');
  if (category) productsQuery = productsQuery.eq('category', category);
  if (municipality) productsQuery = productsQuery.eq('location', municipality);
  const { data: products, error: productsError } = await productsQuery;
  if (productsError) throw new ApiError(productsError.message, 400);

  const activeProducts = products.filter((product) => product.status === 'active');
  const productById = new Map(products.map((product) => [product.id, product]));
  const productIdSet = new Set(products.map((product) => product.id));
  const hasFilter = Boolean(category || municipality);

  const windowStartMs = Date.now() - daysBack * 24 * 60 * 60 * 1000;
  const { data: recentOrders, error: ordersError } = await supabaseAdmin
    .from('orders')
    .select('product_id, product_name, quantity, unit_price, status, created_at')
    .gte('created_at', new Date(windowStartMs).toISOString());
  if (ordersError) throw new ApiError(ordersError.message, 400);

  // A category/municipality filter can only be applied to orders by joining back through
  // today's matching product rows — orders don't snapshot category/location themselves.
  // That means a product that changed category/location since the order was placed could
  // be mis-attributed for a filtered view; an unfiltered view isn't affected at all.
  const relevantOrders = recentOrders.filter((order) => (
    !EXCLUDED_ORDER_STATUSES.includes(order.status) && (!hasFilter || productIdSet.has(order.product_id))
  ));

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
      });
    }
    return cropMap.get(key);
  };

  activeProducts.forEach((product) => {
    const key = normalizeCropKey(product.name);
    const entry = ensureCrop(key, titleCaseCropName(product.name), product.category);
    entry.activeListings += 1;
    entry.priceSampleTotal += Number(product.price) || 0;
    entry.priceSampleCount += 1;
  });

  relevantOrders.forEach((order) => {
    const product = productById.get(order.product_id);
    const key = normalizeCropKey(product?.name || order.product_name);
    const entry = ensureCrop(key, titleCaseCropName(product?.name || order.product_name), product?.category);
    entry.orderCount += 1;
    entry.quantityOrdered += Number(order.quantity) || 0;
    if (order.unit_price != null && order.created_at) {
      entry.priceHistory.push({ createdAtMs: new Date(order.created_at).getTime(), unitPrice: Number(order.unit_price) });
    }
  });

  // Real OpenWeatherMap data (see weatherService.js) — null when the API key isn't
  // configured or the request fails, never a guessed reading standing in for it. Fetched
  // once per request/municipality (not per crop) since it's the same reading for every crop
  // grown/sold in that area.
  const weather = await getWeatherForMunicipality(weatherMunicipality);
  const windowEndMs = Date.now();

  const results = [...cropMap.values()]
    .filter((entry) => entry.activeListings > 0 || entry.orderCount > 0)
    .map((entry) => {
      const currentPrice = entry.priceSampleCount ? entry.priceSampleTotal / entry.priceSampleCount : null;
      const demandPerListing = entry.quantityOrdered / Math.max(entry.activeListings, 1);
      let signal = 'none';
      if (entry.quantityOrdered > 0) {
        signal = entry.activeListings === 0 || demandPerListing >= HIGH_DEMAND_PER_LISTING ? 'opportunity' : 'steady';
      }

      const harvestSeason = inferHarvestSeason(entry.activeListings);
      const { trendPercent, sampleCount: trendSampleCount } = computePriceTrend(entry.priceHistory, windowStartMs, windowEndMs);
      const forecastPrice = computeForecastPrice({ currentPrice, signal, harvestSeason, weather, trendPercent });
      const confidence = computeConfidence({
        orderCount: entry.orderCount,
        activeListings: entry.activeListings,
        hasWeather: Boolean(weather),
        hasTrendData: trendSampleCount >= 4,
      });
      const forecastDemand = computeForecastDemand(signal, harvestSeason);
      const weatherImpact = computeWeatherImpact(weather);
      const status = computeStatus(signal, weather);
      const priceDifference = forecastPrice != null && currentPrice != null ? Math.round((forecastPrice - currentPrice) * 100) / 100 : null;
      const recommendation = buildRecommendation({ crop: entry.crop, signal, harvestSeason, forecastPrice, currentPrice });
      const explanation = buildExplanation({
        crop: entry.crop, currentPrice, forecastPrice, signal, harvestSeason, weather, confidence,
        orderCount: entry.orderCount, forecastDemand,
      });

      return {
        crop: entry.crop,
        category: entry.category,
        currentPrice,
        activeListings: entry.activeListings,
        orderCount: entry.orderCount,
        quantityOrdered: entry.quantityOrdered,
        demandPerListing,
        signal,
        status,
        forecastPrice,
        priceDifference,
        forecastDemand,
        confidence,
        weatherImpact,
        harvestSeason,
        recommendation,
        explanation,
        forecastPending: false,
      };
    })
    .sort((a, b) => b.quantityOrdered - a.quantityOrdered);

  const response = { weather, crops: results };
  setCached(cacheKey, response);
  res.json(response);
}
