export function hasWholesalePricing(product) {
  const retailPrice = Number(product?.price);
  const wholesalePrice = Number(product?.wholesalePrice);
  const wholesaleMinimum = Number(product?.wholesaleMinQuantity);
  return Number.isFinite(retailPrice)
    && Number.isFinite(wholesalePrice)
    && wholesalePrice > 0
    && wholesalePrice < retailPrice
    && Number.isFinite(wholesaleMinimum)
    && wholesaleMinimum > 0;
}

export function isWholesaleQuantity(product, quantity) {
  const orderQuantity = Number(quantity);
  return hasWholesalePricing(product)
    && Number.isFinite(orderQuantity)
    && orderQuantity >= Number(product.wholesaleMinQuantity);
}

export function getApplicableUnitPrice(product, quantity) {
  return isWholesaleQuantity(product, quantity)
    ? Number(product.wholesalePrice)
    : Number(product?.price) || 0;
}

// Existing tiers stay available for restocking after sales reduce stock below the minimum.
export function getWholesalePricingErrors(values, existing = null) {
  const errors = {};
  const wholesalePrice = Number(values.wholesalePrice);
  const minimum = Number(values.wholesaleMinQuantity);
  if (!Number.isFinite(wholesalePrice) || wholesalePrice <= 0) {
    errors.wholesalePrice = 'Enter a positive wholesale price.';
  } else if (Number(wholesalePrice.toFixed(2)) !== wholesalePrice) {
    errors.wholesalePrice = 'Use no more than two decimal places for the wholesale price.';
  } else if (!(wholesalePrice < Number(values.price))) {
    errors.wholesalePrice = 'Wholesale price must be lower than the retail price.';
  }
  if (!Number.isFinite(minimum) || minimum <= 0) {
    errors.wholesaleMinQuantity = 'Enter a positive wholesale minimum.';
  } else if (Number(minimum.toFixed(2)) !== minimum) {
    errors.wholesaleMinQuantity = 'Use no more than two decimal places for the wholesale minimum.';
  } else if (minimum > Number(values.quantity)
    && !(hasWholesalePricing(existing) && minimum === Number(existing.wholesaleMinQuantity)
      && values.unit === existing.unit)) {
    errors.wholesaleMinQuantity = 'Wholesale minimum cannot exceed the quantity available.';
  }
  return errors;
}

export function getSuggestedWholesaleMinimum(availableQuantity) {
  const stock = Number(availableQuantity);
  if (!Number.isFinite(stock) || stock <= 0) return null;
  return Math.min(stock, Math.max(1, Math.ceil(stock * 0.1)));
}

export function getRecommendedWholesalePrice(retailPrice, costPrice) {
  const retail = Number(retailPrice);
  const cost = Number(costPrice);
  if (!Number.isFinite(retail) || !Number.isFinite(cost) || cost <= 0 || retail <= cost) return null;
  const recommended = Number((cost + (retail - cost) / 2).toFixed(2));
  return recommended > cost && recommended < retail ? recommended : null;
}
