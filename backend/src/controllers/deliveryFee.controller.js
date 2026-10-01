import { calculateDeliveryFee } from '../lib/deliveryFee.js';
import { CEBU_MUNICIPALITIES, DELIVERY_METHODS } from '../utils/constants.js';
import { ApiError } from '../lib/ApiError.js';













export async function getDeliveryFeeEstimate(req, res) {
  const {
    originMunicipality, deliveryMunicipality, deliveryMethod, buyerLat, buyerLng,
  } = req.query;

  if (!CEBU_MUNICIPALITIES.includes(originMunicipality)) throw new ApiError('originMunicipality is required.', 400);
  if (!DELIVERY_METHODS.includes(deliveryMethod)) throw new ApiError('A valid deliveryMethod is required.', 400);
  if (deliveryMethod !== 'buyer_pickup' && !CEBU_MUNICIPALITIES.includes(deliveryMunicipality)) {
    throw new ApiError('deliveryMunicipality is required.', 400);
  }

  let buyerCoords = null;
  if (deliveryMethod === 'buyer_pickup' && buyerLat != null && buyerLng != null) {
    const lat = Number(buyerLat);
    const lng = Number(buyerLng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) buyerCoords = { lat, lng };
  }

  const result = await calculateDeliveryFee(originMunicipality, deliveryMunicipality, deliveryMethod, buyerCoords);
  res.json(result);
}
