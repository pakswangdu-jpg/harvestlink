import { ApiError } from './ApiError.js';
import { calculateDeliveryFee } from './deliveryFee.js';
import { matchMunicipality } from './geo.js';
import { CEBU_MUNICIPALITIES, DELIVERY_METHODS } from '../utils/constants.js';
import { getApplicableUnitPrice, isWholesaleQuantity } from '../../shared/pricing.js';
import {
  EXPIRED_PRODUCT_ERROR_CODE,
  EXPIRED_PRODUCT_ERROR_MESSAGE,
  EXPIRED_PRODUCT_ERROR_TITLE,
  isProductExpired,
} from '../../shared/expiration.js';

const money = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

export async function buildCheckoutQuote(product, values) {
  const quantity = Number(values.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0 || Number(quantity.toFixed(2)) !== quantity) {
    throw new ApiError('Enter a positive quantity with no more than two decimal places.', 400);
  }
  if (Number(product.quantity) <= 0) {
    throw new ApiError(
      'Sorry, this product is no longer available. Another buyer has already reserved the remaining stock.',
      409,
      'PRODUCT_OUT_OF_STOCK',
    );
  }
  if (product.status !== 'active' || product.price_review?.status === 'pending' || product.price_review?.status === 'declined') {
    throw new ApiError('This product is not available for ordering.', 400);
  }
  if (isProductExpired(product.expiration_date)) {
    throw new ApiError(
      EXPIRED_PRODUCT_ERROR_MESSAGE,
      400,
      EXPIRED_PRODUCT_ERROR_CODE,
      EXPIRED_PRODUCT_ERROR_TITLE,
    );
  }
  if (quantity > Number(product.quantity)) {
    throw new ApiError(
      `Only ${product.quantity} ${product.unit} remaining. Please update your order quantity.`,
      409,
      'INSUFFICIENT_STOCK',
    );
  }
  if (!Number.isFinite(Number(product.quantity)) || !Number.isFinite(Number(product.price)) || Number(product.price) < 0) {
    throw new ApiError('This listing has invalid stock or pricing. Please contact the farmer.', 400);
  }
  if (product.selling_type === 'wholesale' && product.moq && quantity < Number(product.moq)) {
    throw new ApiError(`Minimum order quantity is ${product.moq} ${product.unit}.`, 400);
  }
  const isWholesaleListing = product.selling_type === 'wholesale';
  const originMunicipality = matchMunicipality(product.location);
  const pricing = { price: product.price, wholesalePrice: product.wholesale_price, wholesaleMinQuantity: product.wholesale_min_quantity };
  const unitPrice = getApplicableUnitPrice(pricing, quantity);
  const subtotal = money(quantity * unitPrice);
  const retailSubtotal = money(quantity * Number(product.original_price ?? product.price));
  const discount = money(Math.max(0, retailSubtotal - subtotal));

  if (isWholesaleListing) {
    const deliveryMunicipality = values.deliveryMunicipality || originMunicipality;
    return {
      unitPrice,
      subtotal,
      retailSubtotal,
      discount,
      total: subtotal,
      isWholesalePrice: true,
      requiresFarmerArrangement: true,
      originMunicipality,
      deliveryMunicipality,
      estimate: {
        fee: 0,
        distanceKm: null,
        durationMinutes: null,
        tierLabel: 'Farmer-arranged',
        source: 'farmer_arranged',
      },
    };
  }

  if (!DELIVERY_METHODS.includes(values.deliveryMethod)) throw new ApiError('Choose a valid delivery method.', 400);
  if (values.deliveryMethod === 'courier') {
    const deliveryMunicipality = values.deliveryMunicipality || originMunicipality;
    return {
      unitPrice,
      subtotal,
      retailSubtotal,
      discount,
      total: subtotal,
      isWholesalePrice: isWholesaleQuantity(pricing, quantity),
      requiresFarmerArrangement: true,
      originMunicipality,
      deliveryMunicipality,
      estimate: {
        fee: 0,
        distanceKm: null,
        durationMinutes: null,
        tierLabel: 'Pending farmer confirmation.',
        source: 'farmer_arranged',
      },
    };
  }
  if (values.deliveryMethod !== 'buyer_pickup' && !CEBU_MUNICIPALITIES.includes(values.deliveryMunicipality)) {
    throw new ApiError('Choose a supported delivery municipality.', 400);
  }
  const deliveryMunicipality = values.deliveryMethod === 'buyer_pickup' ? originMunicipality : values.deliveryMunicipality;
  const estimate = await calculateDeliveryFee(originMunicipality, deliveryMunicipality, values.deliveryMethod);
  const deliveryFee = money(Number(estimate.fee));
  if (!Number.isFinite(deliveryFee) || deliveryFee < 0) throw new ApiError('Delivery quotation unavailable. Please try again.', 502);
  return {
    unitPrice, subtotal, retailSubtotal, discount,
    total: money(subtotal + deliveryFee), isWholesalePrice: isWholesaleQuantity(pricing, quantity),
    originMunicipality, deliveryMunicipality, estimate: { ...estimate, fee: deliveryFee },
  };
}
