// Deviation thresholds mirror the REAL fair-pricing rule already enforced server-side
// (backend/src/lib/priceReview.js's PRICE_DEVIATION_THRESHOLD_PERCENT = 20, which actually
// puts a farmer's listing into DTI review) — "Overpriced" here fires at the same 20% a
// listing would already have been flagged at, rather than an invented, disconnected number.
const SLIGHTLY_ABOVE_THRESHOLD = 10;
const OVERPRICED_THRESHOLD = 20;
const UNDERPRICED_THRESHOLD = -10;

export const STATUS_META = {
  normal: { label: 'Normal', tone: 'success' },
  'slightly-above': { label: 'Slightly Above PSA', tone: 'warning' },
  'under-review': { label: 'Under Review', tone: 'orange' },
  overpriced: { label: 'Overpriced', tone: 'danger' },
  underpriced: { label: 'Underpriced', tone: 'teal' },
  'no-psa': { label: 'No PSA Data', tone: 'neutral' },
  overridden: { label: 'Overridden', tone: 'info' },
};

// hasOverride wins over any price comparison (an override IS the current reference — it's
// not "wrong", it's authoritative), hasPendingReview wins over a plain deviation number (a
// human is already actively looking at that specific listing), and only then does the raw
// average-vs-PSA math decide. `referencePrice` is whatever's authoritative right now (PSA or
// override) — the caller resolves that before calling this.
export function resolveCommodityStatus({
  referencePrice, avgFarmerPrice, hasOverride, hasPendingReview,
}) {
  if (referencePrice == null) return 'no-psa';
  if (hasOverride) return 'overridden';
  if (hasPendingReview) return 'under-review';
  if (avgFarmerPrice == null) return 'normal';

  const deviationPct = ((avgFarmerPrice - referencePrice) / referencePrice) * 100;
  if (deviationPct > OVERPRICED_THRESHOLD) return 'overpriced';
  if (deviationPct > SLIGHTLY_ABOVE_THRESHOLD) return 'slightly-above';
  if (deviationPct < UNDERPRICED_THRESHOLD) return 'underpriced';
  return 'normal';
}
