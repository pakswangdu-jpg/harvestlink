import { ApiError } from './ApiError.js';
import { calculateDeliveryFee } from './deliveryFee.js';
import { matchMunicipality } from './geo.js';
import { getQuotation } from './lalamoveClient.js';
import { CEBU_MUNICIPALITIES, DELIVERY_METHODS, getMunicipalityCoords } from '../utils/constants.js';
import { getApplicableUnitPrice, isWholesaleQuantity } from '../../shared/pricing.js';

const money = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

export async function buildCheckoutQuote(product, values) {
  const quantity = Number(values.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0 || Number(quantity.toFixed(2)) !== quantity) {
    throw new ApiError('Enter a positive quantity with no more than two decimal places.', 400);
  }
  if (product.status !== 'active' || product.price_review?.status === 'pending' || product.price_review?.status === 'declined') {
    throw new ApiError('This product is not available for ordering.', 400);
  }
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  if (product.expiration_date && String(product.expiration_date).slice(0, 10) < today) {
    throw new ApiError('This listing has expired.', 400);
  }
  if (quantity > Number(product.quantity)) throw new ApiError(`Only ${product.quantity} ${product.unit} available.`, 400);
  if (!Number.isFinite(Number(product.quantity)) || !Number.isFinite(Number(product.price)) || Number(product.price) < 0) {
    throw new ApiError('This listing has invalid stock or pricing. Please contact the farmer.', 400);
  }
  if (product.selling_type === 'wholesale' && product.moq && quantity < Number(product.moq)) {
    throw new ApiError(`Minimum order quantity is ${product.moq} ${product.unit}.`, 400);
  }
  if (!DELIVERY_METHODS.includes(values.deliveryMethod)) throw new ApiError('Choose a valid delivery method.', 400);
  if (values.deliveryMethod !== 'buyer_pickup' && !CEBU_MUNICIPALITIES.includes(values.deliveryMunicipality)) {
    throw new ApiError('Choose a supported delivery municipality.', 400);
  }
  const originMunicipality = matchMunicipality(product.location);
  const deliveryMunicipality = values.deliveryMethod === 'buyer_pickup' ? originMunicipality : values.deliveryMunicipality;
  let estimate;
  if (values.deliveryMethod === 'courier') {
    const quotation = await getQuotation({
      pickup: { ...getMunicipalityCoords(originMunicipality), address: product.location || originMunicipality },
      dropoff: { ...getMunicipalityCoords(deliveryMunicipality), address: deliveryMunicipality },
    });
    estimate = { ...quotation, tierLabel: 'Lalamove', source: 'lalamove' };
  } else {
    estimate = await calculateDeliveryFee(originMunicipality, deliveryMunicipality, values.deliveryMethod);
  }
  const pricing = { price: product.price, wholesalePrice: product.wholesale_price, wholesaleMinQuantity: product.wholesale_min_quantity };
  const unitPrice = getApplicableUnitPrice(pricing, quantity);
  const subtotal = money(quantity * unitPrice);
  const retailSubtotal = money(quantity * Number(product.original_price ?? product.price));
  const deliveryFee = money(Number(estimate.fee));
  if (!Number.isFinite(deliveryFee) || deliveryFee < 0) throw new ApiError('Delivery quotation unavailable. Please try again.', 502);
  return {
    unitPrice, subtotal, retailSubtotal, discount: money(Math.max(0, retailSubtotal - subtotal)),
    total: money(subtotal + deliveryFee), isWholesalePrice: isWholesaleQuantity(pricing, quantity),
    originMunicipality, deliveryMunicipality, estimate: { ...estimate, fee: deliveryFee },
  };
}
