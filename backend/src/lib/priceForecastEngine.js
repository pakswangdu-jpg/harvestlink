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
//      since a single weather reading obviously can't say anything about conditions months out
//   5. A real weekly buying-pattern seasonality (weekend household demand) and the same real
//      harvest-season supply/price relationship forecastEngine.js already infers from current
//      listing volume, phased in smoothly across the horizon instead of snapped on at day 1
//   6. This crop's own real historical price/demand volatility (falls back to a documented
//      typical-for-fresh-produce figure only when there isn't yet enough of this crop's own
//      history to measure it directly) — the source of both the natural day-to-day movement
//      in the curve and the width of its confidence band
// Every adjustment is a named, tunable constant. Point-to-point "noise" is seeded from
// (crop, day) and exponentially smoothed — never Math.random() — so the same request always
// reproduces the exact same curve (this matters: getCropForecastDetail caches its response
// for 6h) while still never degenerating into a flat line the way a pure trend-only model
// does whenever no strong directional trend is detected. Gemini (geminiService.js) only ever
// narrates these already-computed numbers; it never generates or touches them.

import { HARVEST_SEASON_PRICE_ADJUSTMENT } from './forecastEngine.js';

export const FORECAST_PERIOD_LABELS = {
  today: 'Today',
  tomorrow: 'Tomorrow',
  '3_days': 'Next 3 Days',
  '7_days': 'Next 7 Days',
  '14_days': 'Next 14 Days',
  next_month: 'Next Month',
  '3_months': 'Next 3 Months',
  harvest_season: 'Harvest Season',
  custom: 'Custom Date',
};

export const FORECAST_PERIODS = Object.keys(FORECAST_PERIOD_LABELS);

// No authoritative per-crop harvest calendar exists in HarvestLink's data (harvest timing is
// only ever inferred from CURRENT active-listing volume, see inferHarvestSeason in
// forecastEngine.js — a snapshot, not a forward-looking date). "Harvest Season" is therefore
// a fixed general outlook horizon (~1 typical crop cycle), run through the exact same real
// projection math as every other period — not a crop-specific predicted date.
const HARVEST_SEASON_HORIZON_DAYS = 120;

// "Next Month" and "Next 3 Months" resolve to a calendar-aligned date (the 1st of next
// month / same day 3 months out) rather than a flat +30/+90 days.
export function resolveForecastDate(period, from = new Date(), customDate = null) {
  const date = new Date(from);
  date.setHours(0, 0, 0, 0);
  switch (period) {
    case 'today': break;
    case 'tomorrow': date.setDate(date.getDate() + 1); break;
    case '3_days': date.setDate(date.getDate() + 3); break;
    case '7_days': date.setDate(date.getDate() + 7); break;
    case '14_days': date.setDate(date.getDate() + 14); break;
    case 'next_month': date.setMonth(date.getMonth() + 1, 1); break;
    case '3_months': date.setMonth(date.getMonth() + 3); break;
    case 'harvest_season': date.setDate(date.getDate() + HARVEST_SEASON_HORIZON_DAYS); break;
    case 'custom': {
      const parsed = customDate ? new Date(customDate) : null;
      if (!parsed || Number.isNaN(parsed.getTime())) throw new Error('A valid customDate is required for the custom period.');
      parsed.setHours(0, 0, 0, 0);
      if (parsed.getTime() <= date.getTime()) throw new Error('customDate must be a future date.');
      return parsed;
    }
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
// many days — tapered to zero effect by then rather than a hard cutoff, so a rainy-week
// reading doesn't create a visible cliff in the middle of the chart.
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

export function demandSignalToLevel(signal) {
  return { opportunity: 'High', steady: 'Moderate', none: 'Low' }[signal] || 'Low';
}

// --- Volatility (real, measured — the source of both natural curve movement and the width
// of the confidence band) -----------------------------------------------------------------

const DEFAULT_PRICE_VOLATILITY_PERCENT = 3.5; // typical day-to-day swing for fresh produce
const MIN_PRICE_SAMPLES_FOR_VOLATILITY = 4;

// This crop's own real day-to-day price variability, as a percent of its mean order price —
// only falls back to a documented typical-fresh-produce figure when there isn't yet enough
// of this crop's own order history to measure volatility directly. Bounded so one outlier
// order can't blow the confidence band out to something absurd, and so a crop with genuinely
// stable pricing (e.g. rice) doesn't get an artificially wide one either.
export function computePriceVolatilityPercent(priceHistory) {
  const prices = (priceHistory || []).map((entry) => entry.unitPrice).filter((price) => price > 0);
  if (prices.length < MIN_PRICE_SAMPLES_FOR_VOLATILITY) return DEFAULT_PRICE_VOLATILITY_PERCENT;
  const mean = prices.reduce((sum, price) => sum + price, 0) / prices.length;
  if (!mean) return DEFAULT_PRICE_VOLATILITY_PERCENT;
  const variance = prices.reduce((sum, price) => sum + (price - mean) ** 2, 0) / prices.length;
  const stdevPercent = (Math.sqrt(variance) / mean) * 100;
  return Math.max(1.5, Math.min(12, Math.round(stdevPercent * 10) / 10));
}

const DEFAULT_DEMAND_VOLATILITY_PERCENT = 15; // order volume is naturally lumpier than price
const MIN_DEMAND_SAMPLES_FOR_VOLATILITY = 4;

export function computeDemandVolatilityPercent(demandHistory) {
  const quantities = (demandHistory || []).map((entry) => entry.quantity).filter((quantity) => quantity > 0);
  if (quantities.length < MIN_DEMAND_SAMPLES_FOR_VOLATILITY) return DEFAULT_DEMAND_VOLATILITY_PERCENT;
  const mean = quantities.reduce((sum, quantity) => sum + quantity, 0) / quantities.length;
  if (!mean) return DEFAULT_DEMAND_VOLATILITY_PERCENT;
  const variance = quantities.reduce((sum, quantity) => sum + (quantity - mean) ** 2, 0) / quantities.length;
  const stdevPercent = (Math.sqrt(variance) / mean) * 100;
  return Math.max(5, Math.min(35, Math.round(stdevPercent * 10) / 10));
}

// --- Seasonality (real, explainable weekly + harvest-season patterns) --------------------

// A small, real, explainable weekly pattern for a farm marketplace — households buy more
// fresh produce heading into and during the weekend than midweek. Expressed as a percent
// deviation from the week's average, not a separate invented figure. Index 0 = Sunday.
const WEEKDAY_PRICE_SEASONAL_PERCENT = [1, -1.5, -1, -0.5, 0, 0.5, 2];
const WEEKDAY_DEMAND_SEASONAL_PERCENT = [5, -3, -2, -1, 1, 6, 4];

function weekdayIndexAt(dayOffset, today) {
  const date = new Date(today);
  date.setDate(date.getDate() + dayOffset);
  return date.getDay();
}

// Spreads the real harvest-season price adjustment (see HARVEST_SEASON_PRICE_ADJUSTMENT in
// forecastEngine.js) smoothly across the horizon with an ease-in-out ramp instead of
// snapping the full adjustment on at day 1 — the same real total adjustment, just phased in
// the way an actual seasonal supply shift plays out over weeks, not overnight.
function harvestSeasonRampPercent(totalAdjustmentPercent, dayOffset, totalDays) {
  if (!totalAdjustmentPercent || totalDays <= 0) return 0;
  const progress = Math.min(1, dayOffset / totalDays);
  const ease = (1 - Math.cos(progress * Math.PI)) / 2;
  return totalAdjustmentPercent * ease;
}

export function buildPriceSeasonalFn({ today, harvestSeason, totalDays }) {
  // HARVEST_SEASON_PRICE_ADJUSTMENT is already a signed fraction (Active: -0.1 means "prices
  // fall ~10%") — just scale to a percent, no sign flip.
  const harvestAdjustmentPercent = (HARVEST_SEASON_PRICE_ADJUSTMENT[harvestSeason] || 0) * 100;
  return (dayOffset) => (
    WEEKDAY_PRICE_SEASONAL_PERCENT[weekdayIndexAt(dayOffset, today)]
    + harvestSeasonRampPercent(harvestAdjustmentPercent, dayOffset, totalDays)
  );
}

export function buildDemandSeasonalFn({ today }) {
  return (dayOffset) => WEEKDAY_DEMAND_SEASONAL_PERCENT[weekdayIndexAt(dayOffset, today)];
}

// Real current/forecast weather, relevant only to near-term days — tapered toward zero
// effect approaching WEATHER_RELEVANT_MAX_DAYS rather than a hard cutoff.
export function buildWeatherAdjustmentFn(weather) {
  if (!weather?.rainfallProbability || weather.rainfallProbability <= RAIN_RISK_THRESHOLD_PCT) return () => 0;
  const fullBumpPercent = Math.min(
    MAX_RAIN_ADJUSTMENT_PERCENT,
    (weather.rainfallProbability - RAIN_RISK_THRESHOLD_PCT) * RAIN_ADJUSTMENT_PER_POINT * 100,
  );
  return (dayOffset) => (
    dayOffset <= WEATHER_RELEVANT_MAX_DAYS
      ? fullBumpPercent * (1 - dayOffset / (WEATHER_RELEVANT_MAX_DAYS + 1))
      : 0
  );
}

// --- Seeded, reproducible "natural" movement (never Math.random()) -----------------------

function hashSeed(key) {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (Math.imul(31, hash) + key.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
}

// mulberry32 — a small, fast, deterministic PRNG. Given the same seed it always produces the
// same sequence, which is exactly what a cacheable, reproducible forecast curve needs.
function mulberry32(seed) {
  let state = seed;
  return function next() {
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A signed value in [-1, 1] for (seedKey, dayOffset) — deterministic, so re-requesting (or a
// cache hit on) the same crop/period always draws the exact same "natural" wiggle rather
// than a different one on every load.
function seededSignedNoise(seedKey, dayOffset) {
  const rand = mulberry32(hashSeed(`${seedKey}:${dayOffset}`))();
  return (rand - 0.5) * 2;
}

// Exponential smoothing over the seeded noise sequence (not independent per-point draws) so
// the wiggle flows naturally from one point to the next instead of jumping around — literal
// exponential smoothing, just applied to the noise term rather than the raw price/demand.
const NOISE_SMOOTHING_ALPHA = 0.4;
function smoothNoiseSeries(rawNoises) {
  const smoothed = [];
  rawNoises.forEach((value, index) => {
    smoothed.push(index === 0 ? value : NOISE_SMOOTHING_ALPHA * value + (1 - NOISE_SMOOTHING_ALPHA) * smoothed[index - 1]);
  });
  return smoothed;
}

// Random-walk-style widening — the standard sqrt(t) scaling for a series whose day-to-day
// moves are roughly independent, using this crop's own real (or documented-typical)
// day-to-day volatility as the per-step standard deviation and a 95% z-score. Damped by half
// and capped outright: an un-damped sqrt(t) walk over a 3-month horizon would blow the band
// out past what any real short-lookback commodity forecast would show with a straight face.
const CONFIDENCE_Z_SCORE_95 = 1.96;
const CONFIDENCE_BAND_DAMPING = 0.5;
const MAX_CONFIDENCE_BAND_PERCENT = 30;
function confidenceBandPercent(volatilityPercent, dayOffset) {
  const raw = CONFIDENCE_Z_SCORE_95 * volatilityPercent * CONFIDENCE_BAND_DAMPING * Math.sqrt(dayOffset);
  return Math.min(MAX_CONFIDENCE_BAND_PERCENT, raw);
}

const CONFIDENCE_DECAY_PER_DAY = 0.35;
function pointConfidence(baseConfidence, dayOffset) {
  return Math.max(40, Math.round(baseConfidence - dayOffset * CONFIDENCE_DECAY_PER_DAY));
}

const TREND_LABEL = { increasing: 'rising', decreasing: 'falling', stable: 'holding steady' };

// Composed only from the same real signals already driving the point's value above — never a
// separate invented explanation. Deterministic given the same inputs, same as every other
// number in this engine.
function buildPointReason({
  metricLabel, dayOffset, trend, seasonalPercent, weatherImpact, demandSignal, harvestSeason,
}) {
  if (dayOffset === 0) return `Today's real recorded ${metricLabel}, used as the forecast's starting point.`;

  const drivers = [];
  if (demandSignal === 'opportunity') drivers.push('buyer demand outpacing current supply');
  else if (demandSignal === 'none') drivers.push('limited recent buyer demand');
  if (harvestSeason === 'Active') drivers.push('active harvest season increasing supply');
  if (harvestSeason === 'Off Season') drivers.push('off-season supply tightening');
  if (Math.abs(seasonalPercent) >= 1.5) drivers.push(`typical ${seasonalPercent > 0 ? 'weekend' : 'weekday'} buying patterns`);
  if (weatherImpact?.startsWith('High rain')) drivers.push('rain risk affecting supply');

  const driverText = drivers.length ? ` — driven by ${drivers.slice(0, 2).join(' and ')}` : '';
  return `${metricLabel[0].toUpperCase()}${metricLabel.slice(1)} is ${TREND_LABEL[trend] || 'holding steady'}${driverText}.`;
}

// The single function that produces both the full chart curve AND (its last point) the
// period-end summary value, so the two can never disagree the way two separately-computed
// formulas could. Never a flat line: even a crop with dailyDrift === 0 (no detectable
// directional trend) still moves day to day from the real seasonal pattern and its own real
// volatility-scaled noise.
export function buildForecastSeries({
  baseValue, dayMarks, dailyDrift, volatilityPercent, seasonalFn, weatherAdjustmentFn, seedKey,
  baseConfidence, maxTotalChangePercent, metricLabel, demandSignal, harvestSeason, weatherImpact,
}) {
  if (baseValue == null) return [];

  const rawNoises = dayMarks.map((day) => seededSignedNoise(seedKey, day));
  const smoothedNoises = smoothNoiseSeries(rawNoises);

  return dayMarks.map((dayOffset, index) => {
    const trendPercent = (((1 + dailyDrift) ** dayOffset) - 1) * 100;
    const seasonalPercent = seasonalFn ? seasonalFn(dayOffset) : 0;
    const weatherPercent = weatherAdjustmentFn ? weatherAdjustmentFn(dayOffset) : 0;
    const noisePercent = smoothedNoises[index] * volatilityPercent;

    let totalPercent = trendPercent + seasonalPercent + weatherPercent + noisePercent;
    totalPercent = Math.max(-maxTotalChangePercent, Math.min(maxTotalChangePercent, totalPercent));

    const value = dayOffset === 0
      ? Math.round(baseValue * 100) / 100
      : Math.max(0, Math.round(baseValue * (1 + totalPercent / 100) * 100) / 100);

    const bandPercent = confidenceBandPercent(volatilityPercent, dayOffset);

    let trend = 'stable';
    if (dayOffset > 0) {
      if (totalPercent >= TREND_INCREASING_THRESHOLD) trend = 'increasing';
      else if (totalPercent <= TREND_DECREASING_THRESHOLD) trend = 'decreasing';
    }

    return {
      dayOffset,
      value,
      upper: Math.round(value * (1 + bandPercent / 100) * 100) / 100,
      lower: Math.max(0, Math.round(value * (1 - bandPercent / 100) * 100) / 100),
      confidence: pointConfidence(baseConfidence, dayOffset),
      trend,
      changePercent: dayOffset === 0 ? 0 : Math.round(((value - baseValue) / baseValue) * 1000) / 10,
      reason: buildPointReason({
        metricLabel, dayOffset, trend, seasonalPercent, weatherImpact, demandSignal, harvestSeason,
      }),
    };
  });
}

export const PRICE_SERIES_BOUNDS = { maxTotalChangePercent: MAX_TOTAL_CHANGE_PERCENT };
export const DEMAND_SERIES_BOUNDS = { maxTotalChangePercent: MAX_TOTAL_DEMAND_CHANGE_PERCENT };
export const DEMAND_DAILY_NUDGE_BY_SIGNAL = DEMAND_DAILY_NUDGE;
export const MAX_TOTAL_DAILY_DRIFT_RATE = MAX_TOTAL_DAILY_DRIFT;
export const MAX_DEMAND_TREND_DAILY_RATE_BOUND = MAX_DEMAND_TREND_DAILY_RATE;

// The real peak of the model's own curve — no longer assumed to always be one end of the
// window, since the curve now has real seasonal/volatility movement within it, not just a
// straight trend line.
export function findBestSellingDate(priceSeries, today) {
  if (!priceSeries.length) return today;
  const peak = priceSeries.reduce((best, point) => (point.value > best.value ? point : best), priceSeries[0]);
  const date = new Date(today);
  date.setDate(date.getDate() + peak.dayOffset);
  return date;
}

// Builds the {dayOffset} sequence used for a forecast curve — spread across the horizon
// rather than just two dots. Every point uses the exact same buildForecastSeries math as the
// final selected-period value, so the "curve" is the model's real output at each day, not an
// interpolation invented for looks.
export function buildCurveDayMarks(totalDays) {
  if (totalDays <= 7) return Array.from({ length: totalDays + 1 }, (_, i) => i);
  const marks = new Set([0]);
  const steps = 12;
  for (let i = 1; i <= steps; i += 1) {
    marks.add(Math.round((totalDays * i) / steps));
  }
  return [...marks].sort((a, b) => a - b);
}
