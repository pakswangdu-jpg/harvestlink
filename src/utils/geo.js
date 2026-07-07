import { getMunicipalityCoords } from './constants';

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
