// Deterministic multi-horizon PRICE + DEMAND trend-projection engine — the forecasting core
// of the merged Demand Forecast dashboard (originally built for the standalone Price
// Forecast module, now consumed at crop-aggregate granularity by forecast.controller.js).
// There is no ML forecasting service or daily price/demand feed available for Cebu crops,
// so this computes a transparent, explainable projection from real signals already on hand
// instead of pretending to call a black-box model:
//   1. This crop's own recent order-price/order-volume trend (real orders, see priceHistory/
//      demandHistory below)
//   2. PSA's real annual farmgate-price trend for the matched commodity (see psaPriceService.js)
//   3. A real recent-demand signal (order volume for this crop)
//   4. Real current weather (see weatherService.js) — only ever applied to SHORT horizons,
//      since a single weather reading obviously can't say anything about conditions months
//      out.
// Every adjustment is a named, tunable constant and every output is a real, bounded number
// derived from real data — nothing here is randomized or invented. Gemini (geminiService.js)
// only ever explains these already-computed numbers; it never generates or touches them.

export const FORECAST_PERIOD_LABELS = {
  tomorrow: 'Tomorrow',
  '3_days': 'Next 3 Days',
  '7_days': 'Next 7 Days',
  '14_days': 'Next 14 Days',
  '30_days': 'Next 30 Days',
  next_month: 'Next Month',
  '3_months': 'Next 3 Months',
  harvest_season: 'Harvest Season',
};

export const FORECAST_PERIODS = Object.keys(FORECAST_PERIOD_LABELS);

// No authoritative per-crop harvest calendar exists in HarvestLink's data (harvest timing is
// only ever inferred from CURRENT active-listing volume, see inferHarvestSeason in
// forecastEngine.js — a snapshot, not a forward-looking date). "Harvest Season" is therefore
// a fixed general outlook horizon (~1 typical crop cycle), run through the exact same real
// projection math as every other period — not a crop-specific predicted date.
const HARVEST_SEASON_HORIZON_DAYS = 120;

// "Next Month" and "Next 3 Months" resolve to a calendar-aligned date (the 1st of next
// month / same day 3 months out) rather than a flat +30/+90 days — deliberately distinct
// from the rolling "Next 30 Days" window even though the day-counts land close together.
export function resolveForecastDate(period, from = new Date()) {
  const date = new Date(from);
  date.setHours(0, 0, 0, 0);
  switch (period) {
    case 'tomorrow': date.setDate(date.getDate() + 1); break;
    case '3_days': date.setDate(date.getDate() + 3); break;
    case '7_days': date.setDate(date.getDate() + 7); break;
    case '14_days': date.setDate(date.getDate() + 14); break;
    case '30_days': date.setDate(date.getDate() + 30); break;
    case 'next_month': date.setMonth(date.getMonth() + 1, 1); break;
    case '3_months': date.setMonth(date.getMonth() + 3); break;
    case 'harvest_season': date.setDate(date.getDate() + HARVEST_SEASON_HORIZON_DAYS); break;
    default: throw new Error(`Unknown forecast period: ${period}`);
  }
  return date;
}

// --- Tunable constants -----------------------------------------------------------------

const MAX_ORDER_TREND_DAILY_RATE = 0.01;
const MAX_PSA_TREND_DAILY_RATE = 0.005;
const DEMAND_DAILY_NUDGE = { opportunity: 0.003, steady: 0, none: -0.002 };
const MAX_TOTAL_DAILY_DRIFT = 0.02;
const MAX_TOTAL_CHANGE_PERCENT = 50;

const MAX_DEMAND_TREND_DAILY_RATE = 0.01;
const MAX_TOTAL_DEMAND_CHANGE_PERCENT = 80;

// A single current/forecast weather reading is only meaningful for horizons within this
// many days — never applied to "Next Month"/"Next 3 Months" projections.
const WEATHER_RELEVANT_MAX_DAYS = 14;
const RAIN_RISK_THRESHOLD_PCT = 40;
const RAIN_ADJUSTMENT_PER_POINT = 0.0015;
const MAX_RAIN_ADJUSTMENT_PERCENT = 8;

const TREND_INCREASING_THRESHOLD = 2;
const TREND_DECREASING_THRESHOLD = -2;

// `priceHistory`: [{ createdAtMs, unitPrice }] — real order snapshots. Needs at least 2 real
// points on each side of the window's midpoint to say anything about direction; otherwise
// returns 0 (neutral), never a guessed direction. Expressed as a DAILY compounding rate
// (not a flat total percent) so it can be projected out to any horizon length.
export function computeOrderTrendDailyRate(priceHistory, windowStartMs, windowEndMs) {
  if (priceHistory.length < 4) return 0;
  const midpoint = (windowStartMs + windowEndMs) / 2;
  const firstHalf = priceHistory.filter((entry) => entry.createdAtMs < midpoint);
  const secondHalf = priceHistory.filter((entry) => entry.createdAtMs >= midpoint);
  if (firstHalf.length < 2 || secondHalf.length < 2) return 0;

  const average = (list) => list.reduce((sum, entry) => sum + entry.unitPrice, 0) / list.length;
  const firstAvg = average(firstHalf);
  const secondAvg = average(secondHalf);
  if (!firstAvg) return 0;

  const totalPercent = (secondAvg - firstAvg) / firstAvg;
  const windowDays = Math.max(1, (windowEndMs - windowStartMs) / 86400000);
  const dailyRate = (1 + totalPercent) ** (1 / windowDays) - 1;
  return Math.max(-MAX_ORDER_TREND_DAILY_RATE, Math.min(MAX_ORDER_TREND_DAILY_RATE, dailyRate));
}

// `psaPoints`: [{ year, price }] real PSA annual farmgate prices. Uses the earliest and
// latest real (non-null) points in the window to derive a real year-over-year drift, then
// converts that to a daily compounding rate the same way as the order-price trend above.
export function computePsaTrendDailyRate(psaPoints) {
  const withPrice = (psaPoints || []).filter((point) => point.price != null);
  if (withPrice.length < 2) return 0;
  const first = withPrice[0];
  const last = withPrice[withPrice.length - 1];
  const yearsSpan = last.year - first.year;
  if (yearsSpan <= 0 || !first.price) return 0;

  const totalPercent = (last.price - first.price) / first.price;
  const annualRate = (1 + totalPercent) ** (1 / yearsSpan) - 1;
  const dailyRate = (1 + annualRate) ** (1 / 365) - 1;
  return Math.max(-MAX_PSA_TREND_DAILY_RATE, Math.min(MAX_PSA_TREND_DAILY_RATE, dailyRate));
}

// `demandHistory`: [{ createdAtMs, quantity }] — real order quantities within the window.
// Same windowed-half-average shape as computeOrderTrendDailyRate, but compares total ordered
// VOLUME per day between the two halves (not price) to get a real daily growth/decline rate
// for demand itself. Needs at least 2 real points on each side of the midpoint; otherwise
// returns 0 (neutral), never a guessed direction.
export function computeDemandTrendDailyRate(demandHistory, windowStartMs, windowEndMs) {
  if (!demandHistory || demandHistory.length < 4) return 0;
  const midpoint = (windowStartMs + windowEndMs) / 2;
  const firstHalf = demandHistory.filter((entry) => entry.createdAtMs < midpoint);
  const secondHalf = demandHistory.filter((entry) => entry.createdAtMs >= midpoint);
  if (firstHalf.length < 2 || secondHalf.length < 2) return 0;

  const halfDays = Math.max(1, (windowEndMs - windowStartMs) / 2 / 86400000);
  const sum = (list) => list.reduce((total, entry) => total + entry.quantity, 0);
  const firstVolumePerDay = sum(firstHalf) / halfDays;
  const secondVolumePerDay = sum(secondHalf) / halfDays;
  if (!firstVolumePerDay) return 0;

  const totalPercent = (secondVolumePerDay - firstVolumePerDay) / firstVolumePerDay;
  const windowDays = Math.max(1, (windowEndMs - windowStartMs) / 86400000);
  const dailyRate = (1 + totalPercent) ** (1 / windowDays) - 1;
  return Math.max(-MAX_DEMAND_TREND_DAILY_RATE, Math.min(MAX_DEMAND_TREND_DAILY_RATE, dailyRate));
}

// Real recent order volume for this product, bucketed the same "opportunity/steady/none"
// way the existing Demand Forecast engine does (see forecastEngine.js).
export function computeDemandSignal(recentOrderCount) {
  if (recentOrderCount <= 0) return 'none';
  if (recentOrderCount >= 5) return 'opportunity';
  return 'steady';
}

export function demandSignalToLevel(signal) {
  return { opportunity: 'High', steady: 'Moderate', none: 'Low' }[signal] || 'Low';
}

export function computeWeatherImpact(weather) {
  if (!weather) return 'No weather data available';
  if (weather.rainfallProbability == null) return 'Weather data incomplete';
  if (weather.rainfallProbability >= 60) return `High rain risk (${weather.rainfallProbability}%) may reduce supply`;
  if (weather.rainfallProbability >= 30) return `Moderate rain risk (${weather.rainfallProbability}%)`;
  return 'Favorable conditions';
}

// The core projection — a single day-count `daysAhead` in, a bounded {predictedPrice,
// changePercent, trend} out. Used both for the final selected-period forecast and for
// generating the intermediate points that make up the forecast line chart.
export function projectPrice({ currentPrice, daysAhead, orderTrendDailyRate, psaTrendDailyRate, demandSignal, weather }) {
  if (currentPrice == null || daysAhead == null) return null;

  let dailyDrift = orderTrendDailyRate + psaTrendDailyRate + (DEMAND_DAILY_NUDGE[demandSignal] || 0);
  dailyDrift = Math.max(-MAX_TOTAL_DAILY_DRIFT, Math.min(MAX_TOTAL_DAILY_DRIFT, dailyDrift));

  let predictedPrice = currentPrice * (1 + dailyDrift) ** daysAhead;

  if (daysAhead <= WEATHER_RELEVANT_MAX_DAYS && weather?.rainfallProbability != null && weather.rainfallProbability > RAIN_RISK_THRESHOLD_PCT) {
    const rainBumpPercent = Math.min(
      MAX_RAIN_ADJUSTMENT_PERCENT,
      (weather.rainfallProbability - RAIN_RISK_THRESHOLD_PCT) * RAIN_ADJUSTMENT_PER_POINT * 100,
    );
    predictedPrice *= 1 + rainBumpPercent / 100;
  }

  const rawChangePercent = ((predictedPrice - currentPrice) / currentPrice) * 100;
  const changePercent = Math.max(-MAX_TOTAL_CHANGE_PERCENT, Math.min(MAX_TOTAL_CHANGE_PERCENT, rawChangePercent));
  predictedPrice = Math.round(currentPrice * (1 + changePercent / 100) * 100) / 100;

  let trend = 'stable';
  if (changePercent >= TREND_INCREASING_THRESHOLD) trend = 'increasing';
  else if (changePercent <= TREND_DECREASING_THRESHOLD) trend = 'decreasing';

  return { predictedPrice, changePercent: Math.round(changePercent * 100) / 100, trend };
}

// Same shape as projectPrice, applied to demand instead: `currentVolume` is the crop's real
// recent daily order-quantity rate (quantity ordered / lookback days), projected forward at
// `daysAhead` using the real demand daily rate. Returns a rate (units/day at that future
// point), not a period total — the same "point-in-time projection" semantics projectPrice
// uses, so both curves are built the same way.
export function projectDemand({ currentVolume, daysAhead, demandTrendDailyRate }) {
  if (currentVolume == null || daysAhead == null) return null;

  const dailyDrift = Math.max(-MAX_DEMAND_TREND_DAILY_RATE, Math.min(MAX_DEMAND_TREND_DAILY_RATE, demandTrendDailyRate || 0));
  let predictedVolume = currentVolume * (1 + dailyDrift) ** daysAhead;

  const rawChangePercent = currentVolume ? ((predictedVolume - currentVolume) / currentVolume) * 100 : 0;
  const changePercent = Math.max(-MAX_TOTAL_DEMAND_CHANGE_PERCENT, Math.min(MAX_TOTAL_DEMAND_CHANGE_PERCENT, rawChangePercent));
  predictedVolume = Math.round(currentVolume * (1 + changePercent / 100) * 100) / 100;

  let trend = 'stable';
  if (changePercent >= TREND_INCREASING_THRESHOLD) trend = 'increasing';
  else if (changePercent <= TREND_DECREASING_THRESHOLD) trend = 'decreasing';

  return { predictedVolume, changePercent: Math.round(changePercent * 100) / 100, trend };
}

// The monotonic curve this model produces means the best day to sell within the window is
// always one of its two ends (or "today" if the projection is flat) — never an invented
// mid-window peak the model itself doesn't actually predict.
export function computeBestSellingDate(trend, today, forecastDate) {
  if (trend === 'increasing') return forecastDate;
  if (trend === 'decreasing') {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow;
  }
  return today;
}

// Builds the {daysAhead} sequence used for the forecast line chart's intermediate points —
// spread across the horizon rather than just two dots, but every point uses the exact same
// projectPrice() math as the final selected-period value, so the "curve" is the model's
// real output at each day, not an interpolation invented for looks.
export function buildCurveDayMarks(totalDays) {
  if (totalDays <= 7) return Array.from({ length: totalDays + 1 }, (_, i) => i);
  const marks = new Set([0]);
  const steps = 8;
  for (let i = 1; i <= steps; i += 1) {
    marks.add(Math.round((totalDays * i) / steps));
  }
  return [...marks].sort((a, b) => a - b);
}
