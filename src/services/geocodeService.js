import { loadGoogleGeocoding } from '../lib/googleMapsLoader';
import { parseReverseGeocodeResults } from '../utils/reverseGeocodeResult';



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





export async function reverseGeocode({ lat, lng }) {
  const geocoder = await getGeocoder();
  try {
    const { results } = await geocoder.geocode({
      location: { lat: Number(lat), lng: Number(lng) },
    });
    return parseReverseGeocodeResults(results);
  } catch (error) {
    throw new Error('Reverse geocoding failed.', { cause: error });
  }
}
