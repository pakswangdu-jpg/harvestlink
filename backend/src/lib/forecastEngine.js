















export const HARVEST_SEASON_PRICE_ADJUSTMENT = { Active: -0.1, Transitional: 0, 'Off Season': 0.15 };





const ACTIVE_LISTINGS_ACTIVE_SEASON_MIN = 4;
const ACTIVE_LISTINGS_TRANSITIONAL_MIN = 1;

export function inferHarvestSeason(activeListings) {
  if (activeListings >= ACTIVE_LISTINGS_ACTIVE_SEASON_MIN) return 'Active';
  if (activeListings >= ACTIVE_LISTINGS_TRANSITIONAL_MIN) return 'Transitional';
  return 'Off Season';
}








export function computeConfidence({ orderCount, activeListings, hasWeather, hasTrendData, daysAhead = 1 }) {
  let confidence = 45;
  confidence += Math.min(25, orderCount * 3);
  confidence += Math.min(15, activeListings * 3);
  confidence += hasWeather ? 10 : 0;
  confidence += hasTrendData ? 5 : 0;
  confidence -= Math.min(20, Math.floor(daysAhead / 15) * 2);
  return Math.max(35, Math.min(95, Math.round(confidence)));
}




export function computeSupplyLevel(activeListings) {
  if (activeListings >= ACTIVE_LISTINGS_ACTIVE_SEASON_MIN) return 'High';
  if (activeListings >= ACTIVE_LISTINGS_TRANSITIONAL_MIN) return 'Moderate';
  return 'Low';
}




export function computeSeasonalImpact(harvestSeason) {
  const percent = Math.round(Math.abs(HARVEST_SEASON_PRICE_ADJUSTMENT[harvestSeason] || 0) * 100);
  if (harvestSeason === 'Active') return `Active harvest season — increased supply may ease prices by up to ${percent}%.`;
  if (harvestSeason === 'Off Season') return `Off-season supply squeeze may push prices up by as much as ${percent}%.`;
  return 'Transitional season — limited seasonal effect on price.';
}




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




export function computeStatus(signal, weather) {
  if (signal === 'opportunity') return 'High Opportunity';
  if (weather?.rainfallProbability != null && weather.rainfallProbability >= 60) return 'High Risk';
  if (signal === 'steady') return 'Stable Market';
  return 'Low Demand';
}






const RISK_VOLATILITY_HIGH_PERCENT = 7;
const RISK_VOLATILITY_MEDIUM_PERCENT = 4;
const RISK_CONFIDENCE_LOW = 55;

export function computeRiskLevel(volatilityPercent, confidence) {
  if (volatilityPercent >= RISK_VOLATILITY_HIGH_PERCENT || confidence < RISK_CONFIDENCE_LOW) return 'High';
  if (volatilityPercent >= RISK_VOLATILITY_MEDIUM_PERCENT) return 'Medium';
  return 'Low';
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
