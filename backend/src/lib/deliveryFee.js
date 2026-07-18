import { getMunicipalityCoords } from '../utils/constants.js';
import { haversineKm } from './geo.js';
import { fetchRoadRoute } from './roadRouting.js';
import { calculateFeeForDistance } from './deliveryFeeConfig.js';

// Smart distance-based delivery fee — measures the actual road distance (via OSRM, see
// roadRouting.js) between the farmer's and buyer's municipalities, falling back to a
// straight-line distance only if the routing service is unreachable, then prices it against
// the configurable tiers in deliveryFeeConfig.js. Buyer pickup has no delivery leg at all —
// the buyer travels to the farm on their own schedule, so there's nothing to charge for or
// measure.
//
// Returns everything the order needs to persist alongside itself (see createOrder in
// orders.controller.js) so a placed order's fee/distance/tier stay exactly reproducible
// later, even if the pricing config changes afterward.
export async function calculateDeliveryFee(originMunicipality, deliveryMunicipality, deliveryMethod) {
  if (deliveryMethod === 'buyer_pickup') {
    return { fee: 0, distanceKm: 0, durationMinutes: 0, tierLabel: 'Pickup', source: 'pickup' };
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
