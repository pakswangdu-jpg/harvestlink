// Ported from src/services/productService.js's buildPriceReview()/resolveKgPerUnit() —
// the DTI fair-pricing check now runs server-side (a client could otherwise submit any
// price with a forged marketReference to dodge review). Stored as JSONB on products.price_review
// using the SAME camelCase keys the original function produced, so the frontend needs zero
// mapping code to consume it.
import { getFixedKgPerUnit } from './unitConversion.js';
import { ApiError } from './ApiError.js';

const PRICE_DEVIATION_THRESHOLD_PERCENT = 20;

// Mirrors src/utils/validators.js's MAX_PLAUSIBLE_PRICE_PER_KG — duplicated, not imported,
// same reason as marketCommodities.js's own server-side twin: Render only builds/deploys
// backend/ in isolation, so this file can't reach across to src/. Far above any real
// farmgate/retail produce price in this marketplace; exists only to catch a typo (an extra
// digit, or the total cost of a whole harvest typed into a per-unit field) before it reaches
// the marketplace. The frontend already blocks this in the form, but that's advisory only —
// this is the check that actually can't be bypassed by calling the API directly.
const MAX_PLAUSIBLE_PRICE_PER_KG = 5000;

// Units like g/kg/t/L/mL have one universal kg equivalent (see unitConversion.js) and are
// never asked for — everything else falls back to whatever the farmer typed (kgPerUnitInput),
// defaulting to 1 only if that's missing/invalid, same as before.
export function resolveKgPerUnit(unit, kgPerUnitInput) {
  const fixed = getFixedKgPerUnit(unit);
  if (fixed != null) return fixed;
  const parsed = Number(kgPerUnitInput);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

// Throws if `amountPerSellingUnit` (cost or price, in the farmer's own selling unit) is
// implausible once normalized to per-kg — see MAX_PLAUSIBLE_PRICE_PER_KG above. Called for
// both cost and price on every create/update, same bar either field is held to.
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
