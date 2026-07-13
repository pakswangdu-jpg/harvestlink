import { getMunicipalityCoords } from '../utils/constants.js';
import { haversineKm } from './geo.js';

// Placeholder rates for a Cebu-only prototype — adjust to whatever HarvestLink actually
// wants to charge. Distance is measured municipality-center to municipality-center (the
// same coordinates used everywhere else in the app for maps/ETAs), not a real road route,
// so this is an estimate rather than a routed fare.
const DELIVERY_BASE_FEE = 40;
const DELIVERY_FEE_PER_KM = 10;

// Buyer pickup has no delivery leg at all — the buyer travels to the farm on their own
// schedule, so there's nothing to charge for. Every other method is priced by straight-line
// distance between the farmer's and buyer's municipalities.
export function calculateDeliveryFee(originMunicipality, deliveryMunicipality, deliveryMethod) {
  if (deliveryMethod === 'buyer_pickup') return 0;

  const origin = getMunicipalityCoords(originMunicipality);
  const destination = getMunicipalityCoords(deliveryMunicipality);
  const distanceKm = haversineKm(origin, destination);
  return Math.round(DELIVERY_BASE_FEE + DELIVERY_FEE_PER_KM * distanceKm);
}
