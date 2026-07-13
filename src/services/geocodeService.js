import { loadGoogleGeocoding } from '../lib/googleMapsLoader';

// Bumped whenever the underlying geocoder changes, so previously-cached results computed
// by the old provider don't keep being served as if they came from this one.
const CACHE_PREFIX = 'harvestlink_geocode_google_v1_';
const REVERSE_CACHE_PREFIX = 'harvestlink_reverse_geocode_google_v1_';
// Addresses rarely change, and geocoding is a metered API — cache aggressively rather than
// re-querying the same place repeatedly.
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

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

// One shared Geocoder instance, lazily created on first use (importLibrary() itself already
// dedupes concurrent script-load calls — see lib/googleMapsLoader.js).
let geocoderPromise = null;
function getGeocoder() {
  if (!geocoderPromise) {
    geocoderPromise = loadGoogleGeocoding().then(({ Geocoder }) => new Geocoder());
  }
  return geocoderPromise;
}

async function queryAddress(street, municipality) {
  const geocoder = await getGeocoder();
  try {
    const { results } = await geocoder.geocode({
      address: `${street}, ${municipality}, Cebu, Philippines`,
      region: 'ph',
    });
    if (!results.length) return null;
    const { location } = results[0].geometry;
    return { lat: location.lat(), lng: location.lng() };
  } catch {
    return null;
  }
}

async function queryMunicipality(municipality) {
  const geocoder = await getGeocoder();
  try {
    const { results } = await geocoder.geocode({
      address: `${municipality}, Cebu, Philippines`,
      region: 'ph',
    });
    if (!results.length) return null;
    const { location } = results[0].geometry;
    return { lat: location.lat(), lng: location.lng() };
  } catch {
    return null;
  }
}

// Tries the account's exact registered address first, and only if that genuinely has no
// match, falls back to a municipality-level geocode instead. Returns null (never a guess)
// when even that fails, so the caller can fall back to its own static coordinate table
// rather than ever showing a fabricated position as if it were real. Works for any account
// with address/municipality fields — farmer or buyer alike, since neither field is
// role-specific.
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

function addressComponent(components, type) {
  return components.find((component) => component.types.includes(type))?.long_name || '';
}

// Turns a raw GPS coordinate (from the browser's Geolocation API) into a street-level
// address line and postcode, for the registration form's "use my location" button.
// Coordinates are rounded to ~11m precision before caching/querying — GPS jitters by a few
// meters between reads, and there's no reason to re-query near-identical points. Returns
// null (never a guess) if the geocoder has no data there.
export async function reverseGeocode({ lat, lng }) {
  const roundedLat = Number(lat).toFixed(4);
  const roundedLng = Number(lng).toFixed(4);
  const cacheKey = `${REVERSE_CACHE_PREFIX}${roundedLat}__${roundedLng}`;
  const cached = readCache(cacheKey);
  if (cached) return cached;

  const geocoder = await getGeocoder();
  try {
    const { results } = await geocoder.geocode({
      location: { lat: Number(roundedLat), lng: Number(roundedLng) },
    });
    if (!results.length) return null;
    const components = results[0].address_components;

    const streetLine = [addressComponent(components, 'street_number'), addressComponent(components, 'route')]
      .filter(Boolean)
      .join(' ');
    const barangay = addressComponent(components, 'sublocality_level_1')
      || addressComponent(components, 'neighborhood')
      || addressComponent(components, 'sublocality');
    const addressLine = [streetLine, barangay].filter(Boolean).join(', ');
    const cityText = addressComponent(components, 'locality') || addressComponent(components, 'administrative_area_level_2');

    const result = { address: addressLine, zipCode: addressComponent(components, 'postal_code'), cityText };
    writeCache(cacheKey, result);
    return result;
  } catch {
    return null;
  }
}
