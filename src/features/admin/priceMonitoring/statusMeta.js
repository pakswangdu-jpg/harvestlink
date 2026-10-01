



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
