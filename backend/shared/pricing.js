export function roundMoney(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.round((numeric + Number.EPSILON) * 100) / 100;
}

export function parseOptionalPositiveNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

export function parseOptionalNonNegativeNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

export function calculateEstimatedTotal(unitPrice, quantity) {
  const price = parseOptionalPositiveNumber(unitPrice);
  const qty = parseOptionalPositiveNumber(quantity);
  if (price == null || qty == null) return null;
  return roundMoney(price * qty);
}

/**
 * Shared Wholesale Pricing Calculator (used identically by frontend and backend).
 *
 * Formulas:
 * - Handling Cost per Unit = Handling Cost per Order / MOQ
 * - Total Cost per Unit = Production Cost + Handling Cost per Unit
 * - Recommended Cost-Based Price = Total Cost per Unit / (1 - Target Profit Margin / 100)
 * - Minimum Order Total = Selling Price * MOQ
 * - Estimated Stock Value = Selling Price * Available Quantity
 * - Total Expenses (MOQ order) = Total Cost per Unit * MOQ
 * - Estimated Gross Profit (MOQ order) = Minimum Order Total - Total Expenses
 */
export function calculateWholesalePricing({
  productionCost = null,
  handlingCostPerOrder = null,
  moq = null,
  availableQuantity = null,
  targetProfitMargin = null,
  sellingPrice = null,
  wholesaleReferencePrice = null,
  wholesaleMarketPrice = null,
  unit = 'kg',
} = {}) {
  const cost = parseOptionalPositiveNumber(productionCost);
  const parsedHandling = parseOptionalNonNegativeNumber(handlingCostPerOrder);
  const handlingPerOrder = parsedHandling ?? 0;
  const parsedMoq = parseOptionalPositiveNumber(moq);
  const parsedStock = parseOptionalPositiveNumber(availableQuantity);
  const parsedMargin = parseOptionalNonNegativeNumber(targetProfitMargin);
  const hasValidMargin = parsedMargin != null && parsedMargin < 100;
  const parsedSellingPrice = parseOptionalPositiveNumber(sellingPrice);
  const parsedWholesaleRef = parseOptionalPositiveNumber(wholesaleReferencePrice);
  const parsedWholesaleMarket = parseOptionalPositiveNumber(wholesaleMarketPrice);

  const moqExceedsStock = parsedMoq != null && parsedStock != null && parsedMoq > parsedStock;

  const handlingCostPerUnit = parsedMoq != null && !moqExceedsStock
    ? roundMoney(handlingPerOrder / parsedMoq)
    : null;

  const totalCostPerUnit = cost != null && handlingCostPerUnit != null
    ? roundMoney(cost + handlingCostPerUnit)
    : cost != null
      ? roundMoney(cost)
      : null;

  const recommendedCostBasedPrice = totalCostPerUnit != null && parsedMoq != null && !moqExceedsStock && hasValidMargin
    ? roundMoney(totalCostPerUnit / (1 - parsedMargin / 100))
    : null;

  const wholesaleMarketDataAvailable = parsedWholesaleRef != null || parsedWholesaleMarket != null;

  // Never substitute a retail reference price for wholesale.
  let recommendedPrice = null;
  let pricingBasis = 'insufficient_data';
  if (parsedWholesaleRef != null) {
    recommendedPrice = roundMoney(parsedWholesaleRef);
    pricingBasis = 'wholesale_reference';
  } else if (parsedWholesaleMarket != null) {
    recommendedPrice = roundMoney(parsedWholesaleMarket);
    pricingBasis = 'wholesale_market_data';
  } else if (recommendedCostBasedPrice != null) {
    recommendedPrice = recommendedCostBasedPrice;
    pricingBasis = 'cost_based_wholesale';
  }

  const calculationPrice = recommendedPrice ?? parsedSellingPrice;

  const minimumOrderTotal = calculationPrice != null && parsedMoq != null && !moqExceedsStock
    ? roundMoney(calculationPrice * parsedMoq)
    : null;

  const estimatedStockValue = calculationPrice != null && parsedStock != null
    ? roundMoney(calculationPrice * parsedStock)
    : null;

  const totalExpenses = totalCostPerUnit != null && parsedMoq != null && !moqExceedsStock
    ? roundMoney((cost * parsedMoq) + handlingPerOrder)
    : null;

  const estimatedGrossProfit = minimumOrderTotal != null && totalExpenses != null
    ? roundMoney(minimumOrderTotal - totalExpenses)
    : null;

  const estimatedProfitPerUnit = calculationPrice != null && totalCostPerUnit != null
    ? roundMoney(calculationPrice - totalCostPerUnit)
    : null;

  const achievedProfitMargin = calculationPrice != null && calculationPrice > 0 && estimatedProfitPerUnit != null
    ? roundMoney((estimatedProfitPerUnit / calculationPrice) * 100)
    : null;

  const breakEvenCost = totalCostPerUnit;
  const isRecommendedBelowBreakEven = recommendedPrice != null && breakEvenCost != null && recommendedPrice < breakEvenCost;
  const isEnteredPriceBelowBreakEven = parsedSellingPrice != null && breakEvenCost != null && parsedSellingPrice < breakEvenCost;

  const missingInputs = [];
  if (cost == null) missingInputs.push('production cost');
  if (parsedMoq == null) missingInputs.push('MOQ');
  if (!hasValidMargin) missingInputs.push('target profit margin (0%–99.9%)');

  return {
    salesType: 'wholesale',
    unit,
    productionCost: cost,
    handlingCostPerOrder: parsedHandling,
    effectiveHandlingCostPerOrder: handlingPerOrder,
    moq: parsedMoq,
    availableQuantity: parsedStock,
    targetProfitMargin: hasValidMargin ? parsedMargin : null,
    moqExceedsStock,
    handlingCostPerUnit,
    totalCostPerUnit,
    breakEvenCost,
    recommendedCostBasedPrice,
    wholesaleMarketPrice: parsedWholesaleMarket,
    wholesaleMarketDataAvailable,
    recommendedPrice,
    pricingBasis,
    minimumOrderTotal,
    estimatedStockValue,
    totalExpenses,
    estimatedGrossProfit,
    estimatedProfitPerUnit,
    achievedProfitMargin,
    isRecommendedBelowBreakEven,
    isEnteredPriceBelowBreakEven,
    missingInputs,
  };
}

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
