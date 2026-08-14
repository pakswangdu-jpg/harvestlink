// Server-side port of src/services/marketPriceService.js's PSA annual farmgate-price
// fetch — same PXWeb endpoint and CSV parsing, an in-memory cache instead of localStorage
// (this runs on the server, not in a browser), and no admin-override support (that's a
// browser-only, per-admin-session feature on the frontend's own price-recommendation UI).
// PSA moved this table from DB/2E/CS to DB/2M/NFG — see the matching comment in
// src/services/marketPriceService.js (the frontend copy of this same fetch) for how that was
// confirmed; same table code and dimensions, only the folder changed.
const PSA_TABLE_URL = 'https://openstat.psa.gov.ph/PXWeb/api/v1/en/DB/2M/NFG/0142M4EFGP0.px';
const CENTRAL_VISAYAS_CODE = '10';
const ANNUAL_PERIOD_CODE = '12';
const TABLE_MIN_YEAR = 2010;
const FETCH_TIMEOUT_MS = 5000;
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

const cache = new Map();

function getCached(key) {
  const entry = cache.get(key);
  if (!entry || Date.now() - entry.cachedAt > CACHE_TTL_MS) return null;
  return entry.data;
}

function setCached(key, data) {
  cache.set(key, { data, cachedAt: Date.now() });
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

// Returns [] (never throws) on any failure — a farmer's forecast should still compute from
// whatever real signals ARE available (order history, weather) rather than fail outright
// just because PSA is briefly unreachable.
export async function fetchAnnualPriceTrend(commodityId, yearsBack = 5) {
  const endYear = new Date().getFullYear();
  const startYear = Math.max(TABLE_MIN_YEAR, endYear - yearsBack + 1);
  const cacheKey = `annual_${commodityId}_${startYear}_${endYear}`;
  const cached = getCached(cacheKey);
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

  async function postOnce() {
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

  let points = [];
  let succeeded = false;
  try {
    let response = await postOnce();
    // getDemandForecast computes every distinct crop concurrently (Promise.all), which can
    // fire a dozen+ of these at once — PSA's endpoint 429s a real fraction of requests under
    // that kind of burst even though each works fine alone. One retry after a short backoff
    // recovers most of them, same fix as the frontend's own copy of this fetch
    // (src/services/marketPriceService.js).
    if (response.status === 429) {
      await new Promise((resolve) => setTimeout(resolve, 900));
      response = await postOnce();
    }
    if (response.ok) {
      const text = await response.text();
      const priceByYear = parseAnnualCsv(text);
      for (let year = startYear; year <= endYear; year += 1) {
        points.push({ year, price: priceByYear.has(year) ? priceByYear.get(year) : null });
      }
      succeeded = true;
    }
  } catch {
    points = [];
  }

  // Only cache a genuine result — caching an empty [] from a failed/rate-limited request
  // would otherwise pin "no PSA data" for this commodity for the full 12h TTL, even though
  // a retry moments later would likely have succeeded.
  if (succeeded) setCached(cacheKey, points);
  return points;
}
