const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
// Bumped when the query logic changes, so previously-cached results computed with old
// (buggy) query construction don't keep being served as if they were still correct.
const CACHE_PREFIX = 'harvestlink_geocode_v3_';
// Addresses rarely change, and OSM's Nominatim usage policy asks callers to cache
// aggressively rather than re-querying the same place repeatedly.
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5000;

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

async function queryNominatim(params) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const url = `${NOMINATIM_URL}?${new URLSearchParams(params).toString()}`;
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    const results = await response.json();
    if (!results.length) return null;
    return { lat: Number(results[0].lat), lng: Number(results[0].lon) };
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

// A free-text query mashing a raw, comma-less, abbreviation-heavy address together with
// the municipality name (e.g. "B.Ceniza St. Mantuyong Mandaue City, Mandaue City, Cebu,
// Philippines") badly confuses Nominatim's parser and returns nothing — confirmed live
// even for addresses that genuinely exist in OSM. Nominatim's *structured* search (street/
// city as separate fields) handles exactly this case correctly.
//
// Disambiguation is a genuine two-way trade-off, confirmed live against real cases: adding
// county=Cebu correctly resolves Cebu's several small-town names that are duplicated
// elsewhere in the Philippines (e.g. "San Fernando" would otherwise match Pampanga, "Naga"
// would otherwise match Bicol) — but it breaks geocoding entirely for Cebu's independent,
// highly-urbanized cities (Mandaue, Lapu-Lapu, Cebu City) that OSM's admin hierarchy does
// NOT nest under Cebu province as a "county". So try the disambiguated form first, and only
// if that comes back empty, retry without it.
async function queryAddress(street, municipality) {
  const scoped = await queryNominatim({
    format: 'json',
    limit: '1',
    countrycodes: 'ph',
    street,
    city: municipality,
    county: 'Cebu',
  });
  if (scoped) return scoped;

  await new Promise((resolve) => setTimeout(resolve, 1100));
  return queryNominatim({
    format: 'json',
    limit: '1',
    countrycodes: 'ph',
    street,
    city: municipality,
  });
}

// The plain free-text form works fine for a municipality name alone, since including
// "Cebu" directly in the query string is enough for Nominatim to disambiguate correctly.
async function queryMunicipality(municipality) {
  return queryNominatim({
    format: 'json',
    limit: '1',
    countrycodes: 'ph',
    q: `${municipality}, Cebu, Philippines`,
  });
}

// Most informal Cebu addresses (Purok/Sitio-level, no formal street naming) genuinely have
// no match in OpenStreetMap's data at all — confirmed by testing real examples live, where
// such queries came back empty. So this tries the account's exact registered address first,
// and only if that genuinely has no match, falls back to a municipality-level geocode
// instead. It returns null (never a guess) when even that fails, so the caller can fall
// back to its own static coordinate table rather than ever showing a fabricated position
// as if it were real. Works for any account with address/municipality fields — farmer or
// buyer alike, since neither field is role-specific.
export async function geocodeAccountLocation({ address, municipality }) {
  const cacheKey = `${CACHE_PREFIX}${String(address || '').toLowerCase()}__${String(municipality || '').toLowerCase()}`;
  const cached = readCache(cacheKey);
  if (cached) return cached;

  let result = null;
  if (address && municipality) {
    const exact = await queryAddress(address, municipality);
    if (exact) result = { ...exact, precision: 'address' };
  }
  if (!result && municipality) {
    const approx = await queryMunicipality(municipality);
    if (approx) result = { ...approx, precision: 'municipality' };
  }

  if (result) writeCache(cacheKey, result);
  return result;
}
