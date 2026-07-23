import { calculateDeliveryFee } from '../lib/deliveryFee.js';
import { CEBU_MUNICIPALITIES, DELIVERY_METHODS } from '../utils/constants.js';
import { ApiError } from '../lib/ApiError.js';

// GET /api/delivery-fee/estimate?originMunicipality=&deliveryMunicipality=&deliveryMethod=&buyerLat=&buyerLng=
//
// A read-only preview for the checkout page (see src/components/checkout/
// DeliveryFeeSummary.jsx) — lets the buyer see the real road distance/ETA/fee update live as
// they change their delivery municipality or method, without placing an order. This is
// NEVER what actually gets charged: createOrder (orders.controller.js) always recomputes the
// fee itself from the same lib/deliveryFee.js at order creation, so a manipulated or stale
// preview value can't affect what's actually charged.
//
// buyerLat/buyerLng are optional and only meaningful for deliveryMethod=buyer_pickup — the
// buyer's real-time browser geolocation (see CheckoutForm.jsx), used to show real distance
// from wherever they actually are right now, not a fee (pickup is always free).
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
