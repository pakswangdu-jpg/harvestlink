// Ported from src/services/productService.js's buildPriceReview()/resolveKgPerUnit() —
// the DTI fair-pricing check now runs server-side (a client could otherwise submit any
// price with a forged marketReference to dodge review). Stored as JSONB on products.price_review
// using the SAME camelCase keys the original function produced, so the frontend needs zero
// mapping code to consume it.

const PRICE_DEVIATION_THRESHOLD_PERCENT = 20;

// Defaults to 1 (no conversion) for kg-unit listings, or a missing/invalid figure.
export function resolveKgPerUnit(unit, kgPerUnitInput) {
  if (unit === 'kg') return 1;
  const parsed = Number(kgPerUnitInput);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

// marketReference: { commodityId, commodityLabel, referencePrice, referenceYear } — sent by
// the client, which fetched it from PSA's public price API (untouched, still client-side).
// price: the farmer's listed price, in their own chosen unit (not necessarily per-kg).
// previousReview: the product's existing price_review, if any (re-flagging after an edit
// starts a fresh review rather than keeping a stale decision, unless nothing changed).
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
  };
}
