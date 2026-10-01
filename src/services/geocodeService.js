import { loadGoogleGeocoding } from '../lib/googleMapsLoader';



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

function addressComponent(components, type) {
  return components.find((component) => component.types.includes(type))?.long_name || '';
}





export async function reverseGeocode({ lat, lng }) {
  const geocoder = await getGeocoder();
  try {
    const { results } = await geocoder.geocode({
      location: { lat: Number(lat), lng: Number(lng) },
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






    const result = {
      address: addressLine,
      street: streetLine,
      barangay,
      zipCode: addressComponent(components, 'postal_code'),
      cityText,
      province: addressComponent(components, 'administrative_area_level_1'),
      formattedAddress: results[0].formatted_address || '',
    };
    return result;
  } catch (error) {
    throw new Error('Reverse geocoding failed.', { cause: error });
  }
}
