




import { getFixedKgPerUnit } from './unitConversion.js';
import { ApiError } from './ApiError.js';

const PRICE_DEVIATION_THRESHOLD_PERCENT = 20;








const MAX_PLAUSIBLE_PRICE_PER_KG = 5000;




export function resolveKgPerUnit(unit, kgPerUnitInput) {
  const fixed = getFixedKgPerUnit(unit);
  if (fixed != null) return fixed;
  const parsed = Number(kgPerUnitInput);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}




export function assertPlausiblePricePerKg(label, amountPerSellingUnit, kgPerUnit) {
  const amount = Number(amountPerSellingUnit);
  if (!Number.isFinite(amount) || amount <= 0 || !kgPerUnit) return;
  const perKg = amount / kgPerUnit;
  if (perKg > MAX_PLAUSIBLE_PRICE_PER_KG) {
    throw new ApiError(
      `${label} works out to ₱${perKg.toFixed(2)}/kg, which is unrealistically high for produce — please double-check this value.`,
      400,
    );
  }
}






export function buildPriceReview(marketReference, price, previousReview, kgPerUnit = 1) {
  if (!marketReference || !marketReference.referencePrice) return null;

  const farmerPrice = Number(price);
  const referencePrice = Number(marketReference.referencePrice);
  const pricePerKg = farmerPrice / (kgPerUnit || 1);
  const deviationPct = Number((((pricePerKg - referencePrice) / referencePrice) * 100).toFixed(1));

  if (deviationPct <= PRICE_DEVIATION_THRESHOLD_PERCENT) return null;

  if (previousReview && previousReview.farmerPrice === farmerPrice && previousReview.referencePrice === referencePrice) {
    return previousReview;
  }

  const conversionNote = kgPerUnit && kgPerUnit !== 1
    ? ` — using your stated 1 unit = ${kgPerUnit}kg, this works out to ₱${pricePerKg.toFixed(2)}/kg`
    : '';

  return {
    commodityLabel: marketReference.commodityLabel,
    referencePrice,
    referenceYear: marketReference.referenceYear,
    farmerPrice,
    deviationPct,
    status: 'pending',
    reason: `Price is ${deviationPct}% above the PSA Central Visayas average of ₱${referencePrice.toFixed(2)}/kg for ${marketReference.commodityLabel} (${marketReference.referenceYear})${conversionNote} — exceeds the ${PRICE_DEVIATION_THRESHOLD_PERCENT}% fair-pricing threshold.`,
    createdAt: new Date().toISOString(),
    decidedAt: null,
    referenceSource: marketReference.isOverride ? 'admin' : 'psa',
  };
}

export function reviewDecisionHistory(review) {
  const history = [...(review.previousDecisions || [])];
  if (review.decidedAt) {
    const reason = ['needs_adjustment', 'declined'].includes(review.status) ? review.declineReason || review.reason : review.reason;
    const decision = { status: review.status, decidedAt: review.decidedAt, reason };
    for (const key of ['decidedBy', 'approvedPrice', 'maxAllowedPrice', 'reviewUnit', 'farmerPrice']) {
      if (review[key] != null) decision[key] = review[key];
    }
    history.push(decision);
  }
  return history;
}

export function resubmitPriceReview(reference, price, previousReview, kgPerUnit, unit) {
  const fresh = buildPriceReview(reference, price, null, kgPerUnit);
  const baseline = fresh || previousReview;
  const now = new Date().toISOString();
  const referencePrice = reference?.referencePrice || baseline.referencePrice;
  return {
    ...previousReview, ...fresh,
    reason: fresh?.reason || 'Price revised and resubmitted for Admin review.',
    farmerPrice: Number(price), referencePrice,
    referenceYear: reference?.referenceYear ?? baseline.referenceYear,
    referenceSource: reference ? reference.isOverride ? 'admin' : 'psa' : baseline.referenceSource,
    deviationPct: referencePrice > 0 ? Number((((Number(price) / kgPerUnit - referencePrice) / referencePrice) * 100).toFixed(1)) : null,
    status: 'pending', reviewUnit: unit,
    maxAllowedPrice: previousReview.reviewUnit && previousReview.reviewUnit !== unit ? null : previousReview.maxAllowedPrice,
    createdAt: now, submittedAt: now, decidedAt: null, decidedBy: null, approvedPrice: null,
    previousDecisions: reviewDecisionHistory(previousReview),
  };
}
