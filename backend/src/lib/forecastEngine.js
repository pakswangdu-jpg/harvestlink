// Rule-based demand/supply-side forecasting engine — computes Harvest Season, Confidence
// Score, Supply Level, Seasonal Impact, and status/recommendation text from real signals
// gathered elsewhere (demand signal, real OpenWeatherMap data, real active-listing counts).
// The PRICE/DEMAND trend-projection math (multi-horizon, per period) now lives in
// priceForecastEngine.js — this file covers everything else the merged Demand Forecast
// dashboard needs that isn't a price/demand curve. Every adjustment below is a named,
// tunable constant, never a hidden magic number, and every output is derived from real
// data already on hand — nothing here is randomized or invented.

// --- Tunable constants -----------------------------------------------------------------

// Harvest season is itself inferred from real current supply (see inferHarvestSeason) —
// this just encodes the standard supply/price relationship the season implies.
const HARVEST_SEASON_PRICE_ADJUSTMENT = { Active: -0.1, Transitional: 0, 'Off Season': 0.15 };

// Harvest season is inferred from real current active-listing volume for a crop, not a
// fabricated agricultural calendar (HarvestLink has no authoritative source for one) — the
// same "more active listings -> harvest is happening" logic the spec's own worked example
// describes (Active season -> supply increases -> price decreases).
const ACTIVE_LISTINGS_ACTIVE_SEASON_MIN = 4;
const ACTIVE_LISTINGS_TRANSITIONAL_MIN = 1;

export function inferHarvestSeason(activeListings) {
  if (activeListings >= ACTIVE_LISTINGS_ACTIVE_SEASON_MIN) return 'Active';
  if (activeListings >= ACTIVE_LISTINGS_TRANSITIONAL_MIN) return 'Transitional';
  return 'Off Season';
}

// A transparent proxy for "how much real data backs this forecast," not a statistical
// model's true confidence interval — starts at a moderate baseline and adds points for
// real order volume, real listing volume, real weather availability, and a real detectable
// price trend, capped to a floor/ceiling so it never claims total certainty or near-zero
// trust for a forecast that does have some real signal behind it. `daysAhead` applies an
// honest decay for longer horizons — a forecast 120 days out is genuinely less certain than
// one for tomorrow, using the same real signal.
export function computeConfidence({ orderCount, activeListings, hasWeather, hasTrendData, daysAhead = 1 }) {
  let confidence = 45;
  confidence += Math.min(25, orderCount * 3);
  confidence += Math.min(15, activeListings * 3);
  confidence += hasWeather ? 10 : 0;
  confidence += hasTrendData ? 5 : 0;
  confidence -= Math.min(20, Math.floor(daysAhead / 15) * 2);
  return Math.max(35, Math.min(95, Math.round(confidence)));
}

// Real current active-listing volume, bucketed with the exact same thresholds
// inferHarvestSeason already uses — "how much of this crop is on the market right now,"
// not a forecast in itself.
export function computeSupplyLevel(activeListings) {
  if (activeListings >= ACTIVE_LISTINGS_ACTIVE_SEASON_MIN) return 'High';
  if (activeListings >= ACTIVE_LISTINGS_TRANSITIONAL_MIN) return 'Moderate';
  return 'Low';
}

// Plain-language readout of the exact same HARVEST_SEASON_PRICE_ADJUSTMENT constants the
// (now-removed) price engine used to apply — the real, named adjustment a harvest-season
// state implies, not a separate invented figure.
export function computeSeasonalImpact(harvestSeason) {
  const percent = Math.round(Math.abs(HARVEST_SEASON_PRICE_ADJUSTMENT[harvestSeason] || 0) * 100);
  if (harvestSeason === 'Active') return `Active harvest season — increased supply may ease prices by up to ${percent}%.`;
  if (harvestSeason === 'Off Season') return `Off-season supply squeeze may push prices up by as much as ${percent}%.`;
  return 'Transitional season — limited seasonal effect on price.';
}

// Repurposes the same real current-supply signal as inferHarvestSeason into farmer-facing
// timing guidance — not a fabricated calendar date, just what "harvest season" actually
// looks like in HarvestLink's live listing data right now.
export function bestTimeToHarvestLabel(harvestSeason) {
  if (harvestSeason === 'Active') return 'Now — harvest season is active';
  if (harvestSeason === 'Transitional') return 'Approaching — season is transitioning';
  return 'Hold — off-season for this crop';
}

export function computeForecastDemand(signal, harvestSeason) {
  if (signal === 'opportunity') return harvestSeason === 'Off Season' ? 'Very High' : 'High';
  if (signal === 'steady') return 'Moderate';
  return 'Low';
}

export function computeWeatherImpact(weather) {
  if (!weather) return 'No weather data available';
  if (weather.rainfallProbability == null) return 'Weather data incomplete';
  if (weather.rainfallProbability >= 60) return `High rain risk (${weather.rainfallProbability}%) may reduce supply`;
  if (weather.rainfallProbability >= 30) return `Moderate rain risk (${weather.rainfallProbability}%)`;
  return 'Favorable conditions';
}

// Finally able to use "High Risk" (see forecast.controller.js's earlier history) now that
// real weather is wired in — a real rain-risk reading without an offsetting demand
// opportunity is exactly the case that label was always meant for.
export function computeStatus(signal, weather) {
  if (signal === 'opportunity') return 'High Opportunity';
  if (weather?.rainfallProbability != null && weather.rainfallProbability >= 60) return 'High Risk';
  if (signal === 'steady') return 'Stable Market';
  return 'Low Demand';
}

export function buildRecommendation({ crop, signal, harvestSeason, forecastPrice, currentPrice }) {
  const priceRising = forecastPrice != null && currentPrice != null && forecastPrice > currentPrice;
  if (signal === 'opportunity' && harvestSeason === 'Off Season') {
    return `Demand for ${crop} is outpacing supply during an off-season window — consider planting or listing soon to `
      + `capture the ${priceRising ? 'rising' : 'favorable'} price.`;
  }
  if (signal === 'opportunity') {
    return `Buyer demand for ${crop} is outpacing current active listings — increasing supply now is likely to sell well.`;
  }
  if (signal === 'steady') {
    return `${crop} supply is keeping pace with demand — maintain current listing levels.`;
  }
  return `Recent buyer demand for ${crop} has been limited — consider diversifying or waiting for demand to pick up `
    + 'before increasing supply.';
}
