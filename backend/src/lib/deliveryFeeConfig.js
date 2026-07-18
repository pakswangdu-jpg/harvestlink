// Delivery fee pricing tiers — the single place to change HarvestLink's delivery pricing.
// Tiers are checked in order against the road distance; `maxKm: null` marks the open-ended
// "beyond X km" tier, which charges its own flat fee plus `perKmOverFee` for every km past
// `minKm`. Distances are always measured in kilometers.
export const DELIVERY_FEE_TIERS = [
  { minKm: 0, maxKm: 2, fee: 30 },
  { minKm: 2, maxKm: 5, fee: 50 },
  { minKm: 5, maxKm: 10, fee: 80 },
  { minKm: 10, maxKm: 15, fee: 120 },
  { minKm: 15, maxKm: null, fee: 150, perKmOverFee: 10 },
];

function findTier(distanceKm) {
  const tier = DELIVERY_FEE_TIERS.find(
    (candidate) => distanceKm >= candidate.minKm && (candidate.maxKm === null || distanceKm < candidate.maxKm)
  );
  // Distances below 0 shouldn't happen, but fall back to the first tier rather than throw —
  // a routing quirk producing a tiny negative/NaN distance must never block checkout.
  return tier || DELIVERY_FEE_TIERS[0];
}

// Returns the fee (in pesos, rounded to the nearest whole peso) and a human-readable label
// for the tier that applied — e.g. { fee: 80, tierLabel: '5–10 km' } or, past the last fixed
// tier, { fee: 165, tierLabel: '15+ km' }.
export function calculateFeeForDistance(distanceKm) {
  const km = Math.max(0, Number(distanceKm) || 0);
  const tier = findTier(km);

  if (tier.maxKm === null) {
    const extraKm = Math.max(0, km - tier.minKm);
    return {
      fee: Math.round(tier.fee + extraKm * (tier.perKmOverFee || 0)),
      tierLabel: `${tier.minKm}+ km`,
    };
  }

  return {
    fee: Math.round(tier.fee),
    tierLabel: `${tier.minKm}–${tier.maxKm} km`,
  };
}
