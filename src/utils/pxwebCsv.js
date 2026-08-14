// Low-level plumbing for talking to PSA OpenStat's PXWeb API — used by marketPriceService.js
// (farmgate prices). Only the genuinely table-agnostic pieces live here: parsing PXWeb's CSV
// response shape and making the CORS-safe POST request itself. Caching, retry orchestration,
// and gap-filling stay in the service itself, since those depend on table-specific details.

export function parseCsvLine(line) {
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

// PXWeb silently *omits* the column for any requested year it has no data for (confirmed by
// probing the live API) rather than erroring or padding with a null — so parsing must read the
// year out of each header cell instead of assuming a fixed position, and the caller reconciles
// that against the full requested range to produce explicit gaps (e.g. the current year before
// PSA has published it yet). Works for any PXWeb table queried for exactly one row (one
// commodity/crop at one fixed geolocation and period) with a metric-per-requested-year layout —
// price, volume, and bearing-tree-count series all share this same two-label-column,
// one-column-per-year CSV shape.
export function parseAnnualMetricCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return new Map();
  const headers = parseCsvLine(lines[0]);
  const cells = parseCsvLine(lines[1]);

  const valueByYear = new Map();
  for (let i = 2; i < headers.length; i += 1) {
    const match = headers[i].match(/(\d{4})/);
    if (!match) continue;
    const raw = Number(cells[i]);
    valueByYear.set(Number(match[1]), Number.isFinite(raw) && raw > 0 ? raw : null);
  }
  return valueByYear;
}

// Fetches a PXWeb table via a CORS-simple request: the server has no CORS preflight (OPTIONS)
// handler, so a real `application/json` POST is blocked by the browser before it's even sent.
// Sending the same JSON body as `text/plain` avoids the preflight — the server still parses it
// as JSON regardless of the header. Bounded by a timeout so a slow/unresponsive PSA server can
// never hang the caller indefinitely. A single attempt only — 429 retry is the caller's call,
// since how long to wait and whether to retry at all can differ per use.
export async function postPxwebQueryOnce(tableUrl, query, timeoutMs = 5000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(tableUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(query),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}
