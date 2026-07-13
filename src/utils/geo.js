import { CEBU_MUNICIPALITY_COORDS, DEFAULT_MUNICIPALITY, getMunicipalityCoords } from './constants';

// Mirrors backend/src/lib/deliveryFee.js exactly — keep both in sync. This copy is only
// ever used to show the buyer a live estimate before they submit the order; the actual
// charged fee is always computed authoritatively server-side at order creation.
const DELIVERY_BASE_FEE = 40;
const DELIVERY_FEE_PER_KM = 10;

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
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Picks the municipality whose reference point is physically closest to a raw GPS
// coordinate — used for "use my location" so the match is based on real distance rather
// than trusting a geocoder's admin-boundary text to line up with our municipality list.
// 'Other' is excluded since it's a catch-all label, not a real place to measure against.
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

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

// Nudges a point a small deterministic amount, seeded by id, so two people/orders that
// share a municipality don't collapse onto the exact same coordinate.
function jitterPoint(point, seed) {
  const hash = hashString(String(seed));
  return {
    lat: point.lat + ((hash % 1000) / 1000) * 0.02 - 0.01,
    lng: point.lng + ((Math.floor(hash / 1000) % 1000) / 1000) * 0.02 - 0.01,
  };
}

// Resolves an order/route's origin and destination map coordinates. For a buyer-pickup
// order, `destinationMunicipality` is expected to be the buyer's own starting point (not
// the farm) — callers draw a route showing the buyer how to get there, just without a
// truck/ETA since nothing is actually in transit. Whenever origin and destination happen to
// share a municipality (pickup or not), the destination is nudged by a small deterministic
// offset (seeded by id) — otherwise both ends collapse to the exact same municipality-center
// point and no route can be computed at all, even though a real trip still needs to happen.
// Shared by both the delivery map (drawing the route) and the ETA calculation, so they
// always agree on where the destination actually is.
export function resolveRoutePoints({ id, originMunicipality, destinationMunicipality, deliveryMethod }) {
  const origin = getMunicipalityCoords(originMunicipality);
  const isPickup = deliveryMethod === 'buyer_pickup';
  const sameMunicipality = originMunicipality === destinationMunicipality;
  const destination = sameMunicipality
    ? jitterPoint(getMunicipalityCoords(destinationMunicipality), id)
    : getMunicipalityCoords(destinationMunicipality);
  return { origin, destination, isPickup };
}
