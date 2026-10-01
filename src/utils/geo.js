import { CEBU_MUNICIPALITY_COORDS, DEFAULT_MUNICIPALITY, getMunicipalityCoords } from './constants';




const DELIVERY_BASE_FEE = 40;
const DELIVERY_FEE_PER_KM = 10;

export function validateCoordinates(lat, lng) {
  const isNumber = (value) => (typeof value === 'number' || (typeof value === 'string' && value.trim() !== ''))
    && Number.isFinite(Number(value));
  if (!isNumber(lat) || !isNumber(lng)) return null;
  const point = { lat: Number(lat), lng: Number(lng) };
  return Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180 ? point : null;
}

export function getRegisteredCoordinates(profile) {
  return validateCoordinates(profile?.latitude, profile?.longitude);
}

// Unknown locations stay last; municipality/geocoding fallbacks must not imply exact distances.
export function sortByRegisteredDistance(origin, people) {
  const registeredOrigin = validateCoordinates(origin?.lat, origin?.lng);
  return people.map((person) => {
    const point = getRegisteredCoordinates(person);
    const distanceKm = registeredOrigin && point ? haversineKm(registeredOrigin, point) : null;
    return { ...person, distanceKm: Number.isFinite(distanceKm) ? distanceKm : null };
  }).sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
}

export function formatNearbyDistance(distanceKm) {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) return 'Distance unavailable';
  const meters = Math.round(distanceKm * 1000);
  if (meters < 1000) return `${meters} m away`;
  const kilometers = distanceKm.toFixed(1).replace(/\.0$/, '');
  return `${kilometers} km away`;
}

// Keep distant directory entries available without pulling the initial view away from the user.
export function nearbyMapPoints(origin, points) {
  return [origin, ...points.filter((point) => haversineKm(origin, point) <= 25).slice(0, 8)];
}

export function estimateDeliveryFee(originMunicipality, deliveryMunicipality, deliveryMethod) {
  if (deliveryMethod === 'buyer_pickup') return 0;
  const origin = getMunicipalityCoords(originMunicipality);
  const destination = getMunicipalityCoords(deliveryMunicipality);
  const distanceKm = haversineKm(origin, destination);
  return Math.round(DELIVERY_BASE_FEE + DELIVERY_FEE_PER_KM * distanceKm);
}

export function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}





export function findNearestMunicipality(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return DEFAULT_MUNICIPALITY;
  const point = { lat, lng };
  let nearest = DEFAULT_MUNICIPALITY;
  let nearestDistance = Infinity;
  for (const [municipality, coords] of Object.entries(CEBU_MUNICIPALITY_COORDS)) {
    if (municipality === 'Other') continue;
    const distance = haversineKm(point, coords);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = municipality;
    }
  }
  return nearest;
}






export function nearestByMunicipality(originMunicipality, people, limit = 8) {
  const origin = getMunicipalityCoords(originMunicipality);
  return [...people]
    .sort((a, b) => haversineKm(origin, getMunicipalityCoords(a.municipality)) - haversineKm(origin, getMunicipalityCoords(b.municipality)))
    .slice(0, limit);
}

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}



function jitterPoint(point, seed) {
  const hash = hashString(String(seed));
  return {
    lat: point.lat + ((hash % 1000) / 1000) * 0.02 - 0.01,
    lng: point.lng + ((Math.floor(hash / 1000) % 1000) / 1000) * 0.02 - 0.01,
  };
}










export function resolveRoutePoints({ id, originMunicipality, destinationMunicipality, deliveryMethod }) {
  const origin = getMunicipalityCoords(originMunicipality);
  const isPickup = deliveryMethod === 'buyer_pickup';
  const sameMunicipality = originMunicipality === destinationMunicipality;
  const destination = sameMunicipality
    ? jitterPoint(getMunicipalityCoords(destinationMunicipality), id)
    : getMunicipalityCoords(destinationMunicipality);
  return { origin, destination, isPickup };
}
