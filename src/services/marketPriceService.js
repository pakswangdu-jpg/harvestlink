import { apiClient } from './apiClient';

const PSA_TABLE_URL = 'https://openstat.psa.gov.ph/PXWeb/api/v1/en/DB/2E/CS/0142M4EFGP0.px';
const CENTRAL_VISAYAS_CODE = '10';
const ANNUAL_PERIOD_CODE = '12';
const TABLE_MIN_YEAR = 2010;
const CACHE_PREFIX = 'harvestlink_psa_price_';
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5000;
// How long a fetched overrides map is trusted before re-fetching — short enough that an
// admin's change shows up for other users within a minute, long enough that a page showing
// many commodities at once (Admin Price Monitoring's ~43-row table, MarketInsights) doesn't
// fire a request per commodity.
const OVERRIDES_CACHE_TTL_MS = 60 * 1000;

export const MARKET_REGION_LABEL = 'Central Visayas (Region VII)';
export const PSA_SOURCE_URL = 'https://openstat.psa.gov.ph/PXWeb/api/v1/en/DB/2E/CS/0142M4EFGP0.px';

// All 43 commodities PSA actually publishes farmgate PRICES for, in this exact table
// (0142M4EFGP0 — "Major Crops: Farmgate Prices"). PSA's OpenStat DB/2E/CS collection has ~17
// tables in total, but the other ones (Volume of Production, Area Planted/Harvested, Number
// of Bearing Trees, Fertilizer Use, Stocks Inventory) are production/agricultural statistics
// with no price dimension at all — hundreds more crop names live there, but there's no price
// series behind any of them, so they can't feed this list. This IS the full, complete set of
// commodities this feature can ever show a real PSA price for.
//
// Ordered so a specific variety (e.g. "Mango Piko") is checked before the generic,
// more-common fallback of the same crop family (e.g. "Mango" -> Carabao) — matchCommodity
// returns the first hit, so the more specific keyword must come first in the array.
export const MARKET_COMMODITIES = [
  { id: '28', label: 'Cabbage', keywords: ['cabbage'] },
  { id: '41', label: 'Tomato', keywords: ['tomato'] },
  { id: '33', label: 'Eggplant (Native, Long)', keywords: ['eggplant native long', 'talong native long'] },
  { id: '34', label: 'Eggplant (Native, Round)', keywords: ['eggplant native round', 'talong native round', 'round eggplant'] },
  { id: '32', label: 'Eggplant', keywords: ['eggplant', 'talong'] },
  { id: '27', label: 'Ampalaya (Bitter Gourd)', keywords: ['ampalaya', 'bitter gourd'] },
  { id: '38', label: 'Onion (Yellow Granex)', keywords: ['yellow onion', 'onion yellow', 'bermuda white'] },
  { id: '40', label: 'Onion (Red Shallot)', keywords: ['shallot', 'sibuyas tagalog', 'red shallot'] },
  { id: '39', label: 'Onion (Red Creole)', keywords: ['onion', 'sibuyas'] },
  { id: '29', label: 'Camote (Sweet Potato)', keywords: ['camote', 'sweet potato'] },
  { id: '31', label: 'Cassava (Industrial Use)', keywords: ['cassava industrial', 'industrial cassava'] },
  { id: '30', label: 'Cassava', keywords: ['cassava'] },
  { id: '42', label: 'Potato', keywords: ['potato'] },
  { id: '21', label: 'Mango (Piko)', keywords: ['mango piko', 'piko mango'] },
  { id: '22', label: 'Mango (Indian)', keywords: ['mango indian', 'indian mango'] },
  { id: '23', label: 'Mango (Others)', keywords: ['mango others', 'other mango'] },
  { id: '20', label: 'Mango (Carabao)', keywords: ['mango', 'mangga'] },
  { id: '15', label: 'Banana (Lakatan)', keywords: ['lakatan'] },
  { id: '16', label: 'Banana (Latundan)', keywords: ['latundan'] },
  { id: '13', label: 'Banana (Bungulan)', keywords: ['bungulan'] },
  { id: '14', label: 'Banana (Cavendish)', keywords: ['cavendish'] },
  { id: '18', label: 'Banana (Others)', keywords: ['banana others', 'other banana'] },
  { id: '17', label: 'Banana (Saba)', keywords: ['banana', 'saging'] },
  { id: '19', label: 'Calamansi', keywords: ['calamansi'] },
  { id: '24', label: 'Pineapple (Formosa)', keywords: ['formosa'] },
  { id: '25', label: 'Pineapple (Hawaiian)', keywords: ['hawaiian'] },
  { id: '26', label: 'Pineapple (Native)', keywords: ['pineapple', 'pinya'] },
  { id: '35', label: 'Mongo (Green, Labo)', keywords: ['mongo green', 'green mongo', 'monggo green'] },
  { id: '37', label: 'Mongo (Yellow)', keywords: ['mongo yellow', 'yellow mongo', 'monggo yellow'] },
  { id: '36', label: 'Mongo (Mungbean)', keywords: ['mongo', 'mung bean', 'monggo'] },
  { id: '1', label: 'Coconut (Mature)', keywords: ['coconut', 'niyog'] },
  { id: '2', label: 'Coconut (Young / Buko)', keywords: ['buko', 'young coconut'] },
  { id: '12', label: 'Cacao', keywords: ['cacao', 'cocoa', 'tsokolate'] },
  { id: '8', label: 'Sugarcane', keywords: ['sugarcane', 'tubo'] },
  { id: '3', label: 'Coffee (Arabica)', keywords: ['arabica'] },
  { id: '5', label: 'Coffee (Liberica / Barako)', keywords: ['barako', 'liberica'] },
  { id: '4', label: 'Coffee (Excelsa)', keywords: ['excelsa'] },
  { id: '6', label: 'Coffee (Robusta)', keywords: ['coffee', 'robusta'] },
  { id: '0', label: 'Abaca', keywords: ['abaca'] },
  { id: '7', label: 'Rubber', keywords: ['rubber'] },
  { id: '9', label: 'Tobacco (Native)', keywords: ['tobacco native', 'native tobacco'] },
  { id: '10', label: 'Tobacco (Virginia)', keywords: ['tobacco virginia', 'virginia tobacco'] },
  { id: '11', label: 'Tobacco (Others)', keywords: ['tobacco'] },
];

export function matchCommodity(productName) {
  const normalized = String(productName || '').toLowerCase();
  return MARKET_COMMODITIES.find((commodity) => commodity.keywords.some((keyword) => normalized.includes(keyword))) || null;
}

export function getCommodityById(id) {
  return MARKET_COMMODITIES.find((commodity) => commodity.id === id) || MARKET_COMMODITIES[0];
}

// PSA's figure is the farmgate price — what a trader/middleman pays the farmer, not what
// a buyer pays. Selling direct through HarvestLink already skips that middleman, but the
// farmer still has real harvesting, packing, and delivery costs to cover. Local wholesale
// and retail markups over farmgate commonly run 40-60%+ once a trader is involved, so a
// modest markup here keeps the farmer clearly profitable while the listing still undercuts
// typical retail — a real selling point for buyers browsing the marketplace.
export const RECOMMENDED_MARGIN_PERCENT = 15;

// `referencePrice` is whatever value the caller wants marked up — a raw per-kg PSA figure,
// or (see ProductForm.jsx) that same figure already converted into the farmer's selling unit.
// Converting to the selling unit BEFORE calling this, rather than marking up the per-kg price
// and converting after, matters: multiplying commutes, but rounding doesn't — converting
// first and rounding once here avoids compounding two separate roundings into a different
// final price than the one this function's own math actually implies.
export function getRecommendedPrice(referencePrice) {
  if (!referencePrice || referencePrice <= 0) return null;
  const raw = referencePrice * (1 + RECOMMENDED_MARGIN_PERCENT / 100);
  // Rounded UP to the nearest centavo so the margin is never quietly shaved by rounding down.
  const price = Math.ceil(raw * 100) / 100;
  return { price, marginPercent: RECOMMENDED_MARGIN_PERCENT, referencePrice };
}

// DTI/admin-set reference prices that take precedence over the live PSA figure — used to
// correct a stale/wrong PSA number or fill in the current year before PSA has published it.
// Server-side (see backend/src/controllers/marketPriceOverrides.controller.js), not
// localStorage — an override an admin sets must be visible to every farmer/buyer on their
// own device, not just the browser the admin happened to set it from.
let overridesCache = null;
let overridesCacheAt = 0;

// Never throws — every one of this function's callers ultimately feeds fetchAnnualPriceTrend,
// which every consumer (ProductForm, MarketInsights, MarketPricePanel, Admin Price
// Monitoring) uses for the underlying PSA price itself, not just overrides. A transient
// failure fetching overrides (network hiccup, or simply no overrides ever having been set)
// must never take down the whole PSA price lookup — it should just mean "no override known
// right now," same as the old localStorage version returning {} when nothing was stored.
async function getOverridesMap() {
  if (overridesCache && Date.now() - overridesCacheAt < OVERRIDES_CACHE_TTL_MS) return overridesCache;
  try {
    const rows = await apiClient.get('/market-price-overrides');
    overridesCache = Object.fromEntries(rows.map((row) => [row.commodityId, row]));
    overridesCacheAt = Date.now();
  } catch {
    return overridesCache || {};
  }
  return overridesCache;
}

function invalidateOverridesCache() {
  overridesCache = null;
}

export async function getPriceOverride(commodityId) {
  const overrides = await getOverridesMap();
  return overrides[commodityId] || null;
}

// baseline (the real PSA year/price at the moment this override was set) is what lets
// applyOverride later tell "PSA still hasn't changed" apart from "PSA has since published/
// updated this year's figure", so a stale override can stand down on its own instead of
// permanently masking new PSA data.
//
// Deliberately takes that baseline as a parameter rather than re-fetching PSA internally —
// the caller (Admin Price Monitoring) already has it on screen, it's exactly the "Reference
// price" column the admin is looking at while typing an override. Re-fetching here used to
// mean a Save could silently fail with no error shown at all whenever that extra PSA request
// got rate-limited (see AdminPriceMonitoring.jsx's own comment on how easily ~43 sequential
// requests trips PSA's limiter) — a save should never depend on a fresh network round trip
// for data the page already has in front of the admin.
export async function setPriceOverride(commodityId, referencePrice, baseline = {}) {
  const commodity = getCommodityById(commodityId);
  const override = await apiClient.patch(`/market-price-overrides/${commodityId}`, {
    commodityLabel: commodity.label,
    referencePrice: Number(referencePrice),
    referenceYear: baseline.referenceYear ?? new Date().getFullYear(),
    baselinePrice: baseline.baselinePrice ?? null,
    reason: baseline.reason ?? '',
  });
  invalidateOverridesCache();
  return override;
}

export async function clearPriceOverride(commodityId) {
  await apiClient.delete(`/market-price-overrides/${commodityId}`);
  invalidateOverridesCache();
}

// Price Monitoring's expandable "Price History" panel — newest first, straight from the
// server (see market_price_override_history in supabase/schema.sql). Never cached: an admin
// checking history right after saving an override needs the row they just wrote, not a
// minute-old snapshot.
export async function getOverrideHistory(commodityId) {
  return apiClient.get(`/market-price-overrides/${commodityId}/history`);
}

function readCache(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { value, cachedAt } = JSON.parse(raw);
    if (Date.now() - cachedAt > CACHE_TTL_MS) return null;
    return value;
  } catch {
    return null;
  }
}

function writeCache(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify({ value, cachedAt: Date.now() }));
  } catch {
    // Storage full or unavailable — cache is best-effort only.
  }
}

function parseCsvLine(line) {
  const cells = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

// PXWeb silently *omits* the column for any requested year it has no data for
// (confirmed by probing the live API) rather than erroring or padding with a
// null — so parsing must read the year out of each header cell instead of
// assuming a fixed position, and the caller reconciles that against the full
// requested range to produce explicit gaps (e.g. the current year before PSA
// has published it yet).
function parseAnnualCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return new Map();
  const headers = parseCsvLine(lines[0]);
  const cells = parseCsvLine(lines[1]);

  const priceByYear = new Map();
  for (let i = 2; i < headers.length; i += 1) {
    const match = headers[i].match(/(\d{4})/);
    if (!match) continue;
    const raw = Number(cells[i]);
    priceByYear.set(Number(match[1]), Number.isFinite(raw) && raw > 0 ? raw : null);
  }
  return priceByYear;
}

// Applied after every fetch (cached or live) rather than baked into the cached value,
// so an admin override takes effect immediately instead of waiting out the 12h cache TTL.
// Also self-heals: if PSA now shows a different figure for the override's year than it
// did when the override was set, PSA has since published/updated real data, so the
// override's reason (missing/wrong data) no longer holds — drop it and let PSA win.
async function applyOverride(commodityId, points) {
  const override = await getPriceOverride(commodityId);
  if (!override) return points;

  const index = points.findIndex((point) => point.year === override.referenceYear);
  const livePrice = index === -1 ? null : points[index].price;

  if (livePrice != null && livePrice !== override.baselinePrice) {
    await clearPriceOverride(commodityId);
    return points;
  }

  // isOverride marks exactly the one point this override replaced/injected — every other
  // point in the array is untouched real PSA data — so a caller showing "the latest price"
  // to a farmer (ProductForm, MarketPricePanel, MarketInsights) can tell whether that figure
  // is a live PSA number or one an admin set by hand, instead of presenting both identically.
  if (index === -1) {
    return [...points, { year: override.referenceYear, price: override.referencePrice, isOverride: true }]
      .sort((a, b) => a.year - b.year);
  }

  const next = [...points];
  next[index] = { year: override.referenceYear, price: override.referencePrice, isOverride: true };
  return next;
}

async function postPsaQuery(query) {
  // Bounded so a slow/unresponsive PSA server can never hang the caller indefinitely —
  // callers that gate UI on this (e.g. product submission) must always get a settled
  // promise within a few seconds.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(PSA_TABLE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(query),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

// Fetches the PSA farmgate-price table via a CORS-simple request: the server has no
// CORS preflight (OPTIONS) handler, so a real `application/json` POST is blocked by
// the browser before it's even sent. Sending the same JSON body as `text/plain`
// avoids the preflight — the server still parses it as JSON regardless of the header.
async function fetchRawAnnualPriceTrend(commodityId, yearsBack = 5) {
  const endYear = new Date().getFullYear();
  const startYear = Math.max(TABLE_MIN_YEAR, endYear - yearsBack + 1);
  const cacheKey = `${CACHE_PREFIX}annual_${commodityId}_${startYear}_${endYear}`;
  const cached = readCache(cacheKey);
  if (cached) return cached;

  const yearCodes = [];
  for (let year = startYear; year <= endYear; year += 1) {
    yearCodes.push(String(year - TABLE_MIN_YEAR));
  }

  const query = {
    query: [
      { code: 'Commodity', selection: { filter: 'item', values: [commodityId] } },
      { code: 'Geolocation', selection: { filter: 'item', values: [CENTRAL_VISAYAS_CODE] } },
      { code: 'Year', selection: { filter: 'item', values: yearCodes } },
      { code: 'Period', selection: { filter: 'item', values: [ANNUAL_PERIOD_CODE] } },
    ],
    response: { format: 'csv' },
  };

  let response = await postPsaQuery(query);
  // PSA's Cloudflare-fronted endpoint 429s a real fraction of requests under any kind of
  // burst (confirmed live: pages that load many commodities in a row, like Admin Price
  // Monitoring, start seeing this after roughly a dozen requests even spaced out) — one
  // retry after a short backoff recovers the vast majority of these, rather than every
  // caller seeing a transient rate limit as "PSA has no data for this commodity."
  if (response.status === 429) {
    await new Promise((resolve) => setTimeout(resolve, 900));
    response = await postPsaQuery(query);
  }

  if (!response.ok) throw new Error('Unable to reach the PSA market price service.');

  const text = await response.text();
  const priceByYear = parseAnnualCsv(text);

  const points = [];
  for (let year = startYear; year <= endYear; year += 1) {
    points.push({ year, price: priceByYear.has(year) ? priceByYear.get(year) : null });
  }

  writeCache(cacheKey, points);
  return points;
}

export async function fetchAnnualPriceTrend(commodityId, yearsBack = 5) {
  const points = await fetchRawAnnualPriceTrend(commodityId, yearsBack);
  return applyOverride(commodityId, points);
}
