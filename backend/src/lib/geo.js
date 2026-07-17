import { CEBU_MUNICIPALITIES, DEFAULT_MUNICIPALITY, getMunicipalityCoords } from '../utils/constants.js';

// Ported verbatim from src/utils/constants.js's matchMunicipality — resolves a product's
// free-ish location text to one of the known municipality strings, used when an order is
// created to derive originMunicipality from the product's location.
export function matchMunicipality(freeText) {
  const normalized = String(freeText || '').toLowerCase();
  const match = CEBU_MUNICIPALITIES.find(
    (municipality) => municipality !== 'Other' && normalized.includes(municipality.toLowerCase())
  );
  return match || DEFAULT_MUNICIPALITY;
}

// Ported verbatim from src/utils/geo.js's haversineKm — used server-side to compute the
// distance-based delivery fee at order creation (see lib/deliveryFee.js).
export function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
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

// Ported verbatim from src/utils/geo.js's resolveRoutePoints (destination side only) — lets
// the real-time GPS handler (realtime/orderTracking.js) know where the buyer pin actually
// renders, including the same same-municipality jitter, so the "near destination" proximity
// check fires at the same point the buyer's map actually shows.
export function resolveDeliveryDestination({ id, originMunicipality, destinationMunicipality }) {
  const destination = getMunicipalityCoords(destinationMunicipality);
  return originMunicipality === destinationMunicipality ? jitterPoint(destination, id) : destination;
}
