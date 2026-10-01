import { getMunicipalityCoords } from '../utils/constants.js';
import { haversineKm } from './geo.js';
import { fetchRoadRoute } from './roadRouting.js';
import { calculateFeeForDistance } from './deliveryFeeConfig.js';













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
