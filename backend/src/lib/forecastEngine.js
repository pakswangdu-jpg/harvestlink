// Rule-based forecasting engine — computes Forecast Price, Confidence Score, Harvest
// Season, and a plain-language explanation from real signals gathered elsewhere (current
// price, demand signal, real OpenWeatherMap data, real historical order prices from
// Supabase). This is NOT a call to any third-party ML/AI service — ForecastAPI's request/
// response contract and an OpenAI key were never provided, so this module exists instead:
// a deterministic, fully-documented set of rules. Every adjustment below is a named,
// tunable constant, never a hidden magic number, and every output is derived from real
// data already on hand — nothing here is randomized or invented.

// --- Tunable constants -----------------------------------------------------------------

// Demand signal (see forecast.controller.js's real order-vs-listing heuristic) nudges
// price the most directly — real buyers outpacing real supply is the strongest signal
// available here.
const DEMAND_PRICE_ADJUSTMENT = { opportunity: 0.12, steady: 0, none: -0.08 };

// Harvest season is itself inferred from real current supply (see inferHarvestSeason) —
// this just encodes the standard supply/price relationship the season implies.
const HARVEST_SEASON_PRICE_ADJUSTMENT = { Active: -0.1, Transitional: 0, 'Off Season': 0.15 };

// Rainfall probability (OpenWeatherMap) above this starts pushing price up — heavy rain
// makes harvesting/transporting fresh produce harder, tightening supply.
const RAIN_RISK_THRESHOLD_PCT = 40;
const RAIN_ADJUSTMENT_PER_POINT = 0.0035;
const MAX_RAIN_ADJUSTMENT = 0.15;
const HOT_TEMP_THRESHOLD_C = 34;
const HOT_TEMP_ADJUSTMENT = 0.03;

// Historical order-price trend (see computePriceTrend) is capped the same as every other
// factor, and the combined adjustment is capped again below — no single forecast can swing
// unrealistically far from today's real price.
const MAX_TREND_ADJUSTMENT = 0.1;
const MAX_TOTAL_ADJUSTMENT = 0.4;

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

// `priceHistory`: [{ createdAtMs, unitPrice }] from real order snapshots within the
// window. Needs at least 2 real price points on EACH side of the window's midpoint to say
// anything about a trend — otherwise returns 0 (neutral), never a guessed direction.
export function computePriceTrend(priceHistory, windowStartMs, windowEndMs) {
  if (priceHistory.length < 4) return { trendPercent: 0, sampleCount: priceHistory.length };
  const midpoint = (windowStartMs + windowEndMs) / 2;
  const firstHalf = priceHistory.filter((entry) => entry.createdAtMs < midpoint);
  const secondHalf = priceHistory.filter((entry) => entry.createdAtMs >= midpoint);
  if (firstHalf.length < 2 || secondHalf.length < 2) return { trendPercent: 0, sampleCount: priceHistory.length };

  const average = (list) => list.reduce((sum, entry) => sum + entry.unitPrice, 0) / list.length;
  const firstAvg = average(firstHalf);
  const secondAvg = average(secondHalf);
  if (!firstAvg) return { trendPercent: 0, sampleCount: priceHistory.length };

  const trendPercent = (secondAvg - firstAvg) / firstAvg;
  return {
    trendPercent: Math.max(-MAX_TREND_ADJUSTMENT, Math.min(MAX_TREND_ADJUSTMENT, trendPercent)),
    sampleCount: priceHistory.length,
  };
}

// Returns null only when there's no current price at all to forecast from (a crop with
// real order history but zero active listings) — every other case always produces a real,
// bounded number instead of "Pending."
export function computeForecastPrice({ currentPrice, signal, harvestSeason, weather, trendPercent }) {
  if (currentPrice == null) return null;

  let adjustment = DEMAND_PRICE_ADJUSTMENT[signal] || 0;
  adjustment += HARVEST_SEASON_PRICE_ADJUSTMENT[harvestSeason] || 0;

  if (weather?.rainfallProbability != null && weather.rainfallProbability > RAIN_RISK_THRESHOLD_PCT) {
    adjustment += Math.min(MAX_RAIN_ADJUSTMENT, (weather.rainfallProbability - RAIN_RISK_THRESHOLD_PCT) * RAIN_ADJUSTMENT_PER_POINT);
  }
  if (weather?.currentTemp != null && weather.currentTemp >= HOT_TEMP_THRESHOLD_C) {
    adjustment += HOT_TEMP_ADJUSTMENT;
  }
  adjustment += trendPercent || 0;
  adjustment = Math.max(-MAX_TOTAL_ADJUSTMENT, Math.min(MAX_TOTAL_ADJUSTMENT, adjustment));

  return Math.round(currentPrice * (1 + adjustment) * 100) / 100;
}

// A transparent proxy for "how much real data backs this forecast," not a statistical
// model's true confidence interval — starts at a moderate baseline and adds points for
// real order volume, real listing volume, real weather availability, and a real detectable
// price trend, capped to a floor/ceiling so it never claims total certainty or near-zero
// trust for a forecast that does have some real signal behind it.
export function computeConfidence({ orderCount, activeListings, hasWeather, hasTrendData }) {
  let confidence = 45;
  confidence += Math.min(25, orderCount * 3);
  confidence += Math.min(15, activeListings * 3);
  confidence += hasWeather ? 10 : 0;
  confidence += hasTrendData ? 5 : 0;
  return Math.max(35, Math.min(95, Math.round(confidence)));
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

// A deterministic, template-assembled explanation — NOT a call to OpenAI (no key
// configured yet). Takes the same shape of "factors" a real OpenAI prompt would need, so
// swapping this for a real call later doesn't require touching any other file.
export function buildExplanation(factors) {
  const {
    crop, currentPrice, forecastPrice, signal, harvestSeason, weather, confidence, orderCount, forecastDemand,
  } = factors;
  const sentences = [];

  if (forecastPrice != null && currentPrice != null) {
    const direction = forecastPrice > currentPrice ? 'rise' : forecastPrice < currentPrice ? 'ease' : 'hold steady';
    const changePercent = currentPrice ? Math.round(((forecastPrice - currentPrice) / currentPrice) * 100) : 0;
    sentences.push(
      `${crop} prices are forecast to ${direction} to about ₱${forecastPrice.toFixed(2)}/unit over the next 30 days`
      + `${changePercent ? ` (${changePercent > 0 ? '+' : ''}${changePercent}% from today's ₱${currentPrice.toFixed(2)})` : ''}.`
    );
  }

  if (signal === 'opportunity') {
    sentences.push(`Recent buyer orders (${orderCount}) have outpaced current active listings, pointing to ${forecastDemand.toLowerCase()} demand ahead.`);
  } else if (signal === 'steady') {
    sentences.push('Current active listings have been keeping pace with recent buyer demand.');
  } else {
    sentences.push('Buyer demand has been limited in the recent order history.');
  }

  if (harvestSeason === 'Off Season') {
    sentences.push('Few farmers currently have this crop actively listed, consistent with an off-season supply squeeze.');
  } else if (harvestSeason === 'Active') {
    sentences.push('Multiple farmers currently have active listings, consistent with an active harvest season.');
  }

  if (weather) {
    if (weather.rainfallProbability != null && weather.rainfallProbability >= 60) {
      sentences.push(`A ${weather.rainfallProbability}% chance of rain in ${weather.municipality} over the next day could further limit harvesting and delivery.`);
    } else if (weather.currentTemp != null && weather.currentTemp >= HOT_TEMP_THRESHOLD_C) {
      sentences.push(`Elevated temperatures in ${weather.municipality} (${weather.currentTemp}°C) may add heat stress on top of current supply levels.`);
    } else {
      sentences.push(`Weather in ${weather.municipality} (${weather.condition?.main || 'stable'}, ${weather.currentTemp}°C) is not expected to significantly disrupt supply.`);
    }
  }

  sentences.push(`Confidence: ${confidence}%, based on real recent order activity, active listings, and ${weather ? 'live weather data' : 'available market data'}.`);

  return sentences.join(' ');
}
