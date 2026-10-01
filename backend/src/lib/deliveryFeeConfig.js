



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


  return tier || DELIVERY_FEE_TIERS[0];
}




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
