import { loadGoogleGeocoding } from '../lib/googleMapsLoader';
import { parseNominatimReverseResult, parseReverseGeocodeResults } from '../utils/reverseGeocodeResult';



const CACHE_PREFIX = 'harvestlink_geocode_google_v1_';


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

  }
}



let geocoderPromise = null;
function getGeocoder() {
  if (!geocoderPromise) {
    geocoderPromise = loadGoogleGeocoding()
      .then(({ Geocoder }) => new Geocoder())
      .catch((error) => {
        geocoderPromise = null;
        throw error;
      });
  }
  return geocoderPromise;
}

async function queryAddress(street, municipality) {
  try {
    const geocoder = await getGeocoder();
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
  try {
    const geocoder = await getGeocoder();
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





async function reverseGeocodeWithNominatim({ lat, lng }) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&addressdetails=1`;
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Nominatim reverse geocoding failed (${response.status}).`);
  const data = await response.json();
  return parseNominatimReverseResult(data);
}

export async function reverseGeocode({ lat, lng }) {
  const numericLat = Number(lat);
  const numericLng = Number(lng);
  let googleError = null;
  try {
    const geocoder = await getGeocoder();
    const { results } = await geocoder.geocode({
      location: { lat: numericLat, lng: numericLng },
    });
    const parsed = parseReverseGeocodeResults(results);
    if (parsed && (parsed.completeAddress || parsed.formattedAddress || parsed.address)) {
      return parsed;
    }
  } catch (error) {
    googleError = error;
  }

  try {
    const fallback = await reverseGeocodeWithNominatim({ lat: numericLat, lng: numericLng });
    if (fallback) return fallback;
  } catch (fallbackError) {
    throw new Error('Reverse geocoding failed.', { cause: fallbackError });
  }

  if (googleError) throw new Error('Reverse geocoding failed.', { cause: googleError });
  return null;
}
