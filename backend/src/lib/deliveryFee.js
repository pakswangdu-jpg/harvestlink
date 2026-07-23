import { getMunicipalityCoords } from '../utils/constants.js';
import { haversineKm } from './geo.js';
import { fetchRoadRoute } from './roadRouting.js';
import { calculateFeeForDistance } from './deliveryFeeConfig.js';

// Smart distance-based delivery fee — measures the actual road distance (via OSRM, see
// roadRouting.js) between the farmer's and buyer's municipalities, falling back to a
// straight-line distance only if the routing service is unreachable, then prices it against
// the configurable tiers in deliveryFeeConfig.js. Buyer pickup is never charged a fee — the
// buyer travels to the farm on their own schedule — but when their real-time browser
// location is available (buyerCoords, opt-in geolocation from CheckoutForm.jsx), this still
// reports the real road distance/ETA from exactly where they are right now to the farm, so
// pickup shows a genuine "how far is this" instead of nothing at all.
//
// Returns everything the order needs to persist alongside itself (see createOrder in
// orders.controller.js) so a placed order's fee/distance/tier stay exactly reproducible
// later, even if the pricing config changes afterward.
export async function calculateDeliveryFee(originMunicipality, deliveryMunicipality, deliveryMethod, buyerCoords) {
  if (deliveryMethod === 'buyer_pickup') {
    if (!buyerCoords) return { fee: 0, distanceKm: 0, durationMinutes: 0, tierLabel: 'Pickup', source: 'pickup' };

    const origin = getMunicipalityCoords(originMunicipality);
    const roadRoute = await fetchRoadRoute(buyerCoords, origin);
    const distanceKm = roadRoute ? roadRoute.distanceKm : haversineKm(buyerCoords, origin);
    const durationMinutes = roadRoute ? roadRoute.durationMinutes : null;
    const source = roadRoute ? 'road' : 'straight-line';
    return {
      fee: 0, distanceKm, durationMinutes, tierLabel: 'Pickup', source,
    };
  }

  const origin = getMunicipalityCoords(originMunicipality);
  const destination = getMunicipalityCoords(deliveryMunicipality);

  const roadRoute = await fetchRoadRoute(origin, destination);
  const distanceKm = roadRoute ? roadRoute.distanceKm : haversineKm(origin, destination);
  const durationMinutes = roadRoute ? roadRoute.durationMinutes : null;
  const source = roadRoute ? 'road' : 'straight-line';

  const { fee, tierLabel } = calculateFeeForDistance(distanceKm);
  return { fee, distanceKm, durationMinutes, tierLabel, source };
}
