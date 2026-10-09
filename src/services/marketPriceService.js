import { apiClient } from './apiClient';
import { parseAnnualMetricCsv, postPxwebQueryOnce } from '../utils/pxwebCsv';






const PSA_TABLE_URL = 'https://openstat.psa.gov.ph/PXWeb/api/v1/en/DB/2M/NFG/0142M4EFGP0.px';
const CENTRAL_VISAYAS_CODE = '10';
const ANNUAL_PERIOD_CODE = '12';
const TABLE_MIN_YEAR = 2010;
const CACHE_PREFIX = 'harvestlink_psa_price_';
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5000;




const OVERRIDES_CACHE_TTL_MS = 60 * 1000;

export const MARKET_REGION_LABEL = 'Central Visayas (Region VII)';
export const PSA_SOURCE_URL = 'https://openstat.psa.gov.ph/PXWeb/api/v1/en/DB/2M/NFG/0142M4EFGP0.px';












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







export const RECOMMENDED_MARGIN_PERCENT = 15;







export function getRecommendedPrice(referencePrice) {
  if (!referencePrice || referencePrice <= 0) return null;
  const raw = referencePrice * (1 + RECOMMENDED_MARGIN_PERCENT / 100);

  const price = Math.ceil(raw * 100) / 100;
  return { price, marginPercent: RECOMMENDED_MARGIN_PERCENT, referencePrice };
}






let overridesCache = null;
let overridesCacheAt = 0;







async function getOverridesMap({ force = false } = {}) {
  if (!force && overridesCache && Date.now() - overridesCacheAt < OVERRIDES_CACHE_TTL_MS) return overridesCache;
  try {
    const rows = await apiClient.get('/market-price-overrides');
    overridesCache = Object.fromEntries(rows.map((row) => [row.commodityId, row]));
    overridesCacheAt = Date.now();
  } catch (error) {
    if (force) throw error;
    return overridesCache || {};
  }
  return overridesCache;
}

function invalidateOverridesCache() {
  overridesCache = null;
}







export async function getAllPriceOverrides(options) {
  const overrides = await getOverridesMap(options);
  return Object.values(overrides);
}

export async function getPriceOverride(commodityId) {
  const overrides = await getOverridesMap();
  return overrides[commodityId] || null;
}













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

  }
}






async function applyOverride(commodityId, points) {
  const override = await getPriceOverride(commodityId);
  if (!override) return points;

  const index = points.findIndex((point) => point.year === override.referenceYear);
  const livePrice = index === -1 ? null : points[index].price;

  if (livePrice != null && livePrice !== override.baselinePrice) {
    await clearPriceOverride(commodityId);
    return points;
  }





  if (index === -1) {
    return [...points, { year: override.referenceYear, price: override.referencePrice, isOverride: true }]
      .sort((a, b) => a.year - b.year);
  }

  const next = [...points];
  next[index] = { year: override.referenceYear, price: override.referencePrice, isOverride: true };
  return next;
}



export async function fetchRawAnnualPriceTrend(commodityId, yearsBack = 5) {
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

  let response = await postPxwebQueryOnce(PSA_TABLE_URL, query, FETCH_TIMEOUT_MS);





  if (response.status === 429) {
    await new Promise((resolve) => setTimeout(resolve, 900));
    response = await postPxwebQueryOnce(PSA_TABLE_URL, query, FETCH_TIMEOUT_MS);
  }

  if (!response.ok) throw new Error('Unable to reach the PSA market price service.');

  const text = await response.text();
  const priceByYear = parseAnnualMetricCsv(text);

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
