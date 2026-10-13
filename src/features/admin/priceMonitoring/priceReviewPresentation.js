import { matchCommodity } from '../../../services/marketPriceService';
import { getFixedKgPerUnit } from '../../../utils/unitConversion';

export function priceReviewComparison(product, commodities = []) {
  const review = product.priceReview || {};
  const commodity = commodities.find((row) => row.id === matchCommodity(product.name)?.id);
  const kgPerUnit = getFixedKgPerUnit(product.unit) ?? (Number(product.kgPerUnit) > 0 ? Number(product.kgPerUnit) : 1);
  const hasCurrentReference = Number(commodity?.referencePrice) > 0;
  const referencePrice = hasCurrentReference ? Number(commodity.referencePrice) : Number(review.referencePrice);
  const pricePerKg = Number(product.price) / kgPerUnit;
  const deviationPct = referencePrice > 0 ? Number(((pricePerKg / referencePrice - 1) * 100).toFixed(1)) : null;
  const maxAllowedPrice = review.reviewUnit === product.unit && Number(review.maxAllowedPrice) > 0 ? Number(review.maxAllowedPrice) : null;
  return { referencePrice, pricePerKg, deviationPct, maxAllowedPrice,
    possibleOverpricing: deviationPct > 20 || maxAllowedPrice != null && Number(product.price) > maxAllowedPrice,
    referenceSource: hasCurrentReference ? commodity.isOverride ? 'Admin reference' : 'PSA reference' : review.referenceSource === 'admin' ? 'Admin reference' : 'PSA reference',
    referenceYear: hasCurrentReference ? commodity.referenceYear : review.referenceYear,
    psaPrice: commodity?.psaPrice ?? (review.referenceSource !== 'admin' ? review.referencePrice : null) };
}
