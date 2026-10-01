

























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






const HARVEST_SEASON_HORIZON_DAYS = 120;



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



const MAX_ORDER_TREND_DAILY_RATE = 0.01;
const MAX_PSA_TREND_DAILY_RATE = 0.005;
const DEMAND_DAILY_NUDGE = { opportunity: 0.003, steady: 0, none: -0.002 };
const MAX_TOTAL_DAILY_DRIFT = 0.02;
const MAX_TOTAL_CHANGE_PERCENT = 50;

const MAX_DEMAND_TREND_DAILY_RATE = 0.01;
const MAX_TOTAL_DEMAND_CHANGE_PERCENT = 80;




const WEATHER_RELEVANT_MAX_DAYS = 14;
const RAIN_RISK_THRESHOLD_PCT = 40;
const RAIN_ADJUSTMENT_PER_POINT = 0.0015;
const MAX_RAIN_ADJUSTMENT_PERCENT = 8;

const TREND_INCREASING_THRESHOLD = 2;
const TREND_DECREASING_THRESHOLD = -2;





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




const DEFAULT_PRICE_VOLATILITY_PERCENT = 3.5;
const MIN_PRICE_SAMPLES_FOR_VOLATILITY = 4;






export function computePriceVolatilityPercent(priceHistory) {
  const prices = (priceHistory || []).map((entry) => entry.unitPrice).filter((price) => price > 0);
  if (prices.length < MIN_PRICE_SAMPLES_FOR_VOLATILITY) return DEFAULT_PRICE_VOLATILITY_PERCENT;
  const mean = prices.reduce((sum, price) => sum + price, 0) / prices.length;
  if (!mean) return DEFAULT_PRICE_VOLATILITY_PERCENT;
  const variance = prices.reduce((sum, price) => sum + (price - mean) ** 2, 0) / prices.length;
  const stdevPercent = (Math.sqrt(variance) / mean) * 100;
  return Math.max(1.5, Math.min(12, Math.round(stdevPercent * 10) / 10));
}

const DEFAULT_DEMAND_VOLATILITY_PERCENT = 15;
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






const WEEKDAY_PRICE_SEASONAL_PERCENT = [1, -1.5, -1, -0.5, 0, 0.5, 2];
const WEEKDAY_DEMAND_SEASONAL_PERCENT = [5, -3, -2, -1, 1, 6, 4];

function weekdayIndexAt(dayOffset, today) {
  const date = new Date(today);
  date.setDate(date.getDate() + dayOffset);
  return date.getDay();
}





function harvestSeasonRampPercent(totalAdjustmentPercent, dayOffset, totalDays) {
  if (!totalAdjustmentPercent || totalDays <= 0) return 0;
  const progress = Math.min(1, dayOffset / totalDays);
  const ease = (1 - Math.cos(progress * Math.PI)) / 2;
  return totalAdjustmentPercent * ease;
}

export function buildPriceSeasonalFn({ today, harvestSeason, totalDays }) {


  const harvestAdjustmentPercent = (HARVEST_SEASON_PRICE_ADJUSTMENT[harvestSeason] || 0) * 100;
  return (dayOffset) => (
    WEEKDAY_PRICE_SEASONAL_PERCENT[weekdayIndexAt(dayOffset, today)]
    + harvestSeasonRampPercent(harvestAdjustmentPercent, dayOffset, totalDays)
  );
}

export function buildDemandSeasonalFn({ today }) {
  return (dayOffset) => WEEKDAY_DEMAND_SEASONAL_PERCENT[weekdayIndexAt(dayOffset, today)];
}



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



function hashSeed(key) {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (Math.imul(31, hash) + key.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
}



function mulberry32(seed) {
  let state = seed;
  return function next() {
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}




function seededSignedNoise(seedKey, dayOffset) {
  const rand = mulberry32(hashSeed(`${seedKey}:${dayOffset}`))();
  return (rand - 0.5) * 2;
}




const NOISE_SMOOTHING_ALPHA = 0.4;
function smoothNoiseSeries(rawNoises) {
  const smoothed = [];
  rawNoises.forEach((value, index) => {
    smoothed.push(index === 0 ? value : NOISE_SMOOTHING_ALPHA * value + (1 - NOISE_SMOOTHING_ALPHA) * smoothed[index - 1]);
  });
  return smoothed;
}






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




export function findBestSellingDate(priceSeries, today) {
  if (!priceSeries.length) return today;
  const peak = priceSeries.reduce((best, point) => (point.value > best.value ? point : best), priceSeries[0]);
  const date = new Date(today);
  date.setDate(date.getDate() + peak.dayOffset);
  return date;
}





export function buildCurveDayMarks(totalDays) {
  if (totalDays <= 7) return Array.from({ length: totalDays + 1 }, (_, i) => i);
  const marks = new Set([0]);
  const steps = 12;
  for (let i = 1; i <= steps; i += 1) {
    marks.add(Math.round((totalDays * i) / steps));
  }
  return [...marks].sort((a, b) => a - b);
}
