const PSA_TABLE_URL = 'https://openstat.psa.gov.ph/PXWeb/api/v1/en/DB/2E/CS/0142M4EFGP0.px';
const CENTRAL_VISAYAS_CODE = '10';
const ANNUAL_PERIOD_CODE = '12';
const TABLE_MIN_YEAR = 2010;
const CACHE_PREFIX = 'harvestlink_psa_price_';
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5000;
const OVERRIDE_STORAGE_KEY = 'harvestlink_psa_price_overrides';

export const MARKET_REGION_LABEL = 'Central Visayas (Region VII)';
export const PSA_SOURCE_URL = 'https://openstat.psa.gov.ph/PXWeb/api/v1/en/DB/2E/CS/0142M4EFGP0.px';

// Ordered so a specific variety (e.g. "Mango Piko") is checked before the generic,
// more-common fallback of the same crop family (e.g. "Mango" -> Carabao) — matchCommodity
// returns the first hit, so the more specific keyword must come first in the array.
export const MARKET_COMMODITIES = [
  { id: '28', label: 'Cabbage', keywords: ['cabbage'] },
  { id: '41', label: 'Tomato', keywords: ['tomato'] },
  { id: '32', label: 'Eggplant', keywords: ['eggplant', 'talong'] },
  { id: '27', label: 'Ampalaya (Bitter Gourd)', keywords: ['ampalaya', 'bitter gourd'] },
  { id: '38', label: 'Onion (Yellow Granex)', keywords: ['yellow onion', 'onion yellow', 'bermuda white'] },
  { id: '40', label: 'Onion (Red Shallot)', keywords: ['shallot', 'sibuyas tagalog', 'red shallot'] },
  { id: '39', label: 'Onion (Red Creole)', keywords: ['onion', 'sibuyas'] },
  { id: '29', label: 'Camote (Sweet Potato)', keywords: ['camote', 'sweet potato'] },
  { id: '30', label: 'Cassava', keywords: ['cassava'] },
  { id: '42', label: 'Potato', keywords: ['potato'] },
  { id: '21', label: 'Mango (Piko)', keywords: ['mango piko', 'piko mango'] },
  { id: '22', label: 'Mango (Indian)', keywords: ['mango indian', 'indian mango'] },
  { id: '20', label: 'Mango (Carabao)', keywords: ['mango', 'mangga'] },
  { id: '15', label: 'Banana (Lakatan)', keywords: ['lakatan'] },
  { id: '16', label: 'Banana (Latundan)', keywords: ['latundan'] },
  { id: '13', label: 'Banana (Bungulan)', keywords: ['bungulan'] },
  { id: '14', label: 'Banana (Cavendish)', keywords: ['cavendish'] },
  { id: '17', label: 'Banana (Saba)', keywords: ['banana', 'saging'] },
  { id: '19', label: 'Calamansi', keywords: ['calamansi'] },
  { id: '24', label: 'Pineapple (Formosa)', keywords: ['formosa'] },
  { id: '25', label: 'Pineapple (Hawaiian)', keywords: ['hawaiian'] },
  { id: '26', label: 'Pineapple (Native)', keywords: ['pineapple', 'pinya'] },
  { id: '36', label: 'Mongo (Mungbean)', keywords: ['mongo', 'mung bean', 'monggo'] },
  { id: '1', label: 'Coconut (Mature)', keywords: ['coconut', 'niyog'] },
  { id: '2', label: 'Coconut (Young / Buko)', keywords: ['buko', 'young coconut'] },
  { id: '12', label: 'Cacao', keywords: ['cacao', 'cocoa', 'tsokolate'] },
  { id: '8', label: 'Sugarcane', keywords: ['sugarcane', 'tubo'] },
  { id: '3', label: 'Coffee (Arabica)', keywords: ['arabica'] },
  { id: '5', label: 'Coffee (Liberica / Barako)', keywords: ['barako', 'liberica'] },
  { id: '4', label: 'Coffee (Excelsa)', keywords: ['excelsa'] },
  { id: '6', label: 'Coffee (Robusta)', keywords: ['coffee', 'robusta'] },
];

export function matchCommodity(productName) {
  const normalized = String(productName || '').toLowerCase();
  return MARKET_COMMODITIES.find((commodity) => commodity.keywords.some((keyword) => normalized.includes(keyword))) || null;
}

export function getCommodityById(id) {
  return MARKET_COMMODITIES.find((commodity) => commodity.id === id) || MARKET_COMMODITIES[0];
}

// DTI-set reference prices that take precedence over the live PSA figure — used to
// correct a stale/wrong PSA number or fill in the current year before PSA has published it.
function readOverrides() {
  try {
    const raw = localStorage.getItem(OVERRIDE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function getPriceOverride(commodityId) {
  return readOverrides()[commodityId] || null;
}

// baselinePrice is what PSA showed (for referenceYear) at the moment this override was
// set — it's what lets applyOverride later tell "PSA still hasn't changed" apart from
// "PSA has since published/updated this year's figure", so a stale override can stand
// down on its own instead of permanently masking new PSA data.
export async function setPriceOverride(commodityId, referencePrice, yearsBack = 3) {
  const rawPoints = await fetchRawAnnualPriceTrend(commodityId, yearsBack);
  const latest = [...rawPoints].reverse().find((point) => point.price != null);

  const overrides = readOverrides();
  const override = {
    referencePrice: Number(referencePrice),
    referenceYear: latest?.year ?? new Date().getFullYear(),
    baselinePrice: latest?.price ?? null,
    updatedAt: new Date().toISOString(),
  };
  overrides[commodityId] = override;
  localStorage.setItem(OVERRIDE_STORAGE_KEY, JSON.stringify(overrides));
  return override;
}

export function clearPriceOverride(commodityId) {
  const overrides = readOverrides();
  delete overrides[commodityId];
  localStorage.setItem(OVERRIDE_STORAGE_KEY, JSON.stringify(overrides));
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
function applyOverride(commodityId, points) {
  const override = getPriceOverride(commodityId);
  if (!override) return points;

  const index = points.findIndex((point) => point.year === override.referenceYear);
  const livePrice = index === -1 ? null : points[index].price;

  if (livePrice != null && livePrice !== override.baselinePrice) {
    clearPriceOverride(commodityId);
    return points;
  }

  if (index === -1) {
    return [...points, { year: override.referenceYear, price: override.referencePrice }].sort((a, b) => a.year - b.year);
  }

  const next = [...points];
  next[index] = { year: override.referenceYear, price: override.referencePrice };
  return next;
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

  // Bounded so a slow/unresponsive PSA server can never hang the caller indefinitely —
  // callers that gate UI on this (e.g. product submission) must always get a settled
  // promise within a few seconds.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(PSA_TABLE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(query),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
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
