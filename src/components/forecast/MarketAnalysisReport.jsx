import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Activity, Award, Bot, ClipboardList, Gauge, Lightbulb, Minus, Sparkles, Sprout, TrendingDown, TrendingUp, Waves, Wallet,
} from 'lucide-react';
import ForecastChart from './ForecastChart';
import DemandChart from './DemandChart';
import ForecastLegend from './ForecastLegend';
import {
  cropActionRecommendation, formatCurrency, formatDate, formatRelativeTime, harvestActionLabel, sellWindowLabel,
} from '../../utils/formatters';

const SECTION_CLASS = 'rounded-2xl border border-gray-200 bg-white p-6';
const SECTION_TITLE_CLASS = 'text-[20px] font-semibold leading-tight text-gray-900';

const fadeIn = {
  initial: { opacity: 0, y: 8 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-40px' },
  transition: { duration: 0.25 },
};

// Breaks a narrative (Gemini's real aiSummary, or our own deterministic fallback below) into
// short standalone sentences — "do not use a long paragraph," per the design brief. A plain
// sentence-boundary split, not a rewrite: every word shown is still exactly what was written.
function splitIntoSentences(text) {
  if (!text) return [];
  return text.split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim()).filter(Boolean);
}

// The narrative fallback when Gemini's aiSummary isn't available (no GEMINI_API_KEY, or the
// call failed) — every line traces to a real, already-computed forecast field, nothing
// invented for the occasion (same contract as buildRecommendation in forecastEngine.js).
function buildDeterministicSummary(forecast) {
  const {
    crop, referencePrice, priceBasis, unit, expectedChangePercent, marketTrend,
    forecastDemand, supplyLevel, bestTimeToSell,
  } = forecast;
  const lines = [];

  if (referencePrice != null) {
    const basisNote = priceBasis === 'historical'
      ? ' based on the historical order average'
      : priceBasis === 'farmer-listed' ? " based on a farmer's last listed price" : '';
    lines.push(`${crop} is currently priced at ${formatCurrency(referencePrice)}${unit ? `/${unit}` : ''}${basisNote}.`);
  } else {
    lines.push(`No price data is available yet for ${crop}.`);
  }

  if (expectedChangePercent != null && marketTrend) {
    const verb = marketTrend === 'increasing' ? 'rise' : marketTrend === 'decreasing' ? 'fall' : 'stay steady';
    lines.push(`Prices are projected to ${verb}${marketTrend !== 'stable' ? ` by about ${Math.abs(expectedChangePercent)}%` : ''} over the selected period.`);
  }

  lines.push(`Demand is currently ${forecastDemand}, while supply is ${supplyLevel}.`);

  if (bestTimeToSell) lines.push(`The best window to sell is around ${formatDate(bestTimeToSell)}.`);

  return lines;
}

function buildRecommendationChips(forecast) {
  const action = cropActionRecommendation(forecast);
  const ACTION_CHIP = {
    Sell: 'Sell Now', Hold: 'Hold Harvest', Plant: 'Plant Soon', Harvest: 'Harvest Now',
  };
  const chips = [ACTION_CHIP[action] || 'Monitor Market'];
  if (forecast.bestTimeToHarvest) chips.push(harvestActionLabel(forecast.bestTimeToHarvest));
  if (forecast.bestTimeToSell) chips.push(sellWindowLabel(forecast.bestTimeToSell));
  chips.push('Monitor Market');
  return [...new Set(chips)];
}

// What / Why / Expected benefit / When — every clause built from a forecast field that's
// already real and already computed elsewhere on this page, not a separate invented
// explanation (same reasoning as priceForecastEngine.js's own per-point reason text).
function buildRecommendationDetails(forecast) {
  const {
    recommendation, seasonalImpact, weatherImpact, expectedProfit, expectedChangePercent, unit, bestTimeToSell,
  } = forecast;

  const weatherClause = weatherImpact && !weatherImpact.startsWith('Favorable') && !weatherImpact.startsWith('No weather')
    ? weatherImpact
    : null;
  const why = [seasonalImpact, weatherClause].filter(Boolean).join(' ')
    || 'Based on current demand and supply signals for this crop.';

  const benefit = expectedProfit != null
    ? `${expectedProfit >= 0 ? 'Potential gain of' : 'Potential reduction of'} `
      + `${formatCurrency(Math.abs(expectedProfit))}${unit ? `/${unit}` : ''} `
      + `(${expectedChangePercent > 0 ? '+' : ''}${expectedChangePercent}%) if you time the sale accordingly.`
    : 'Not enough price data yet to estimate a specific benefit.';

  const when = bestTimeToSell ? sellWindowLabel(bestTimeToSell) : 'Not enough data to recommend a specific window yet.';

  return { what: recommendation, why, benefit, when };
}

const TREND_META = {
  increasing: { label: 'Bullish', icon: TrendingUp, tone: 'text-green-700' },
  decreasing: { label: 'Bearish', icon: TrendingDown, tone: 'text-red-700' },
  stable: { label: 'Steady', icon: Minus, tone: 'text-gray-900' },
};
const DEMAND_NOTE = {
  'Very High': 'Well above typical demand', High: 'Higher than seasonal average', Moderate: 'In line with seasonal average', Low: 'Below seasonal average',
};
const SUPPLY_NOTE = { High: 'Ample active listings', Moderate: 'Adequate harvest availability', Low: 'Limited harvest availability' };
const RISK_NOTE = { Low: 'Stable conditions', Medium: 'Moderate price swings expected', High: 'Significant price swings possible' };
const RISK_TONE = { Low: 'text-green-700', Medium: 'text-amber-700', High: 'text-red-700' };

function MetricTile({
  icon: Icon, label, value, tone = 'text-gray-900', supporting,
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 text-gray-400">
        <Icon size={14} strokeWidth={2} />
        <span className="text-[13px] font-medium text-gray-500">{label}</span>
      </div>
      <p className={`text-2xl font-bold leading-none ${tone}`}>{value}</p>
      {supporting ? <p className="text-[13px] text-gray-500">{supporting}</p> : null}
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-gray-100 py-2 text-[15px] last:border-b-0">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-900">{value}</span>
    </div>
  );
}

// Only ever rendered next to text that's actually Gemini's own writing (aiSummary/
// aiRecommendation) — never next to the deterministic fallback narrative, which is real
// computed data but not something Gemini wrote, so labeling it "Powered by Gemini" would be
// dishonest the same way a fabricated number would be.
function GeminiBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[12px] font-medium text-gray-400">
      <Sparkles size={12} /> Powered by Gemini
    </span>
  );
}

// Replaces the old fragmented arrangement (AiRecommendationHero + InteractiveForecastChart +
// CropDetailPanel + ForecastSummary + ForecastAnalysis) with one continuous report: Summary
// -> Key Metrics -> Price Forecast -> Recommendation -> Supporting Information. Every number
// still traces to the same real forecast.controller.js/priceForecastEngine.js output as
// before — this only changes how it's organized and presented.
export default function MarketAnalysisReport({ detail, municipality, periodLabel }) {
  const [chartTab, setChartTab] = useState('price');
  if (!detail) return null;

  const {
    crop, unit, referencePrice, priceHigh, priceLow, expectedChangePercent, marketTrend,
    forecastDemand, supplyLevel, riskLevel, priceVolatilityPercent, confidence, orderCount,
    weatherImpact, seasonalImpact, historicalAveragePrice, lastUpdated, aiSummary, aiRecommendation,
  } = detail;

  const summaryLines = aiSummary ? splitIntoSentences(aiSummary) : buildDeterministicSummary(detail);
  const trendMeta = TREND_META[marketTrend] || TREND_META.stable;
  const changeLabel = expectedChangePercent != null ? `${expectedChangePercent > 0 ? '+' : ''}${expectedChangePercent}%` : '—';
  const chips = buildRecommendationChips(detail);
  const recDetails = buildRecommendationDetails(detail);

  const isHistoricalOnly = chartTab === 'price'
    ? (detail.forecastCurve?.length || 0) < 2
    : (detail.demandForecastCurve?.length || 0) < 2;

  return (
    <div className="flex flex-col gap-8">
      {/* AI Summary */}
      <motion.section {...fadeIn} className={SECTION_CLASS}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-green-50 text-green-700">
              <Bot size={16} strokeWidth={2} />
            </span>
            <div>
              <p className={SECTION_TITLE_CLASS}>AI Market Analysis</p>
              <p className="mt-0.5 text-[15px] text-gray-500">{crop} · {municipality || 'All Municipalities'}</p>
            </div>
          </div>
          <span className="text-[13px] font-medium text-gray-400">Forecast generated today</span>
        </div>

        <div className="mt-4 flex flex-col gap-2 border-t border-gray-100 pt-4">
          {summaryLines.map((line) => (
            <p key={line} className="text-[15px] leading-relaxed text-gray-700">{line}</p>
          ))}
        </div>
        {aiSummary ? <div className="mt-3"><GeminiBadge /></div> : null}
      </motion.section>

      {/* Key Metrics */}
      <motion.section {...fadeIn} className={SECTION_CLASS}>
        <p className={SECTION_TITLE_CLASS}>Key Metrics</p>
        <div className="mt-5 grid grid-cols-2 gap-6 lg:grid-cols-4">
          <MetricTile icon={trendMeta.icon} label="Market Trend" value={trendMeta.label} tone={trendMeta.tone} supporting={changeLabel} />
          <MetricTile icon={Sprout} label="Demand" value={forecastDemand} supporting={DEMAND_NOTE[forecastDemand]} />
          <MetricTile icon={Waves} label="Supply" value={supplyLevel} supporting={SUPPLY_NOTE[supplyLevel]} />
          <MetricTile
            icon={Activity}
            label="Risk"
            value={riskLevel}
            tone={RISK_TONE[riskLevel] || 'text-gray-900'}
            supporting={`${RISK_NOTE[riskLevel] || ''}${priceVolatilityPercent != null ? ` (${priceVolatilityPercent}% volatility)` : ''}`}
          />
        </div>
      </motion.section>

      {/* Price Forecast */}
      <motion.section {...fadeIn} className={SECTION_CLASS}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className={SECTION_TITLE_CLASS}>Price Forecast</p>
          {/* No outer border on the group, and forced-color-adjust-none on each button:
              Windows "Contrast themes" otherwise draws its own ButtonBorder around every
              <button> and remaps the authored gray, which is what turned this segmented
              control into stacked black outlines. Same opt-out .btn already uses — the
              selected tab's gray background still marks the active tab on its own. */}
          <div className="flex gap-1 rounded-lg p-0.5">
            {[{ value: 'price', label: 'Price' }, { value: 'demand', label: 'Demand' }].map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setChartTab(option.value)}
                className={`h-7 rounded-md border-0 px-3 text-[13px] font-medium forced-color-adjust-none transition-colors duration-150 ${
                  chartTab === option.value ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-6 lg:grid-cols-4">
          <MetricTile icon={Wallet} label="Today's Price" value={referencePrice != null ? `${formatCurrency(referencePrice)}` : '—'} />
          <MetricTile icon={Award} label="Expected Peak" value={priceHigh != null ? formatCurrency(priceHigh) : '—'} />
          <MetricTile icon={TrendingDown} label="Expected Lowest" value={priceLow != null ? formatCurrency(priceLow) : '—'} />
          <MetricTile
            icon={TrendingUp}
            label="Predicted Change"
            value={changeLabel}
            tone={expectedChangePercent > 0 ? 'text-green-700' : expectedChangePercent < 0 ? 'text-red-700' : 'text-gray-900'}
          />
        </div>

        <div className="mt-6">
          {chartTab === 'price' ? (
            <ForecastChart historicalChart={detail.historicalChart} forecastCurve={detail.forecastCurve} unit={unit} />
          ) : (
            <DemandChart historicalChart={detail.demandHistoricalChart} forecastCurve={detail.demandForecastCurve} unit={unit || 'unit'} />
          )}
        </div>
        <div className="mt-3">
          <ForecastLegend showForecast={!isHistoricalOnly} />
        </div>
      </motion.section>

      {/* AI Recommendation */}
      <motion.section {...fadeIn} className={SECTION_CLASS}>
        <div className="flex items-start gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-green-50 text-green-700">
            <Lightbulb size={16} strokeWidth={2} />
          </span>
          <p className={SECTION_TITLE_CLASS}>Recommended Action</p>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {chips.map((chip) => (
            <span key={chip} className="rounded-full border border-gray-200 px-3 py-1 text-[13px] font-medium text-gray-700">
              {chip}
            </span>
          ))}
        </div>

        {aiRecommendation ? (
          <div className="mt-4">
            <p className="text-[15px] leading-relaxed text-gray-700">{aiRecommendation}</p>
            <div className="mt-1.5"><GeminiBadge /></div>
          </div>
        ) : null}

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <p className="text-[13px] font-semibold uppercase tracking-wide text-gray-400">What to do</p>
            <p className="mt-1 text-[15px] leading-relaxed text-gray-700">{recDetails.what}</p>
          </div>
          <div>
            <p className="text-[13px] font-semibold uppercase tracking-wide text-gray-400">Why</p>
            <p className="mt-1 text-[15px] leading-relaxed text-gray-700">{recDetails.why}</p>
          </div>
          <div>
            <p className="text-[13px] font-semibold uppercase tracking-wide text-gray-400">Expected Benefit</p>
            <p className="mt-1 text-[15px] leading-relaxed text-gray-700">{recDetails.benefit}</p>
          </div>
          <div>
            <p className="text-[13px] font-semibold uppercase tracking-wide text-gray-400">When to Sell</p>
            <p className="mt-1 text-[15px] leading-relaxed text-gray-700">{recDetails.when}</p>
          </div>
        </div>
      </motion.section>

      {/* Supporting Information */}
      <motion.section {...fadeIn} className={SECTION_CLASS}>
        <p className={SECTION_TITLE_CLASS}>Supporting Information</p>
        <div className="mt-5 grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <p className="flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wide text-gray-400">
              <ClipboardList size={13} /> Prediction Factors
            </p>
            <div className="mt-2">
              <InfoRow label="Weather" value={weatherImpact || '—'} />
              <InfoRow label="Seasonality" value={seasonalImpact || '—'} />
              <InfoRow label="Historical Prices" value={historicalAveragePrice != null ? `${formatCurrency(historicalAveragePrice)} avg` : 'No recorded orders yet'} />
              <InfoRow label="Supply" value={supplyLevel || '—'} />
              <InfoRow label="Demand" value={forecastDemand || '—'} />
            </div>
          </div>
          <div>
            <p className="flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wide text-gray-400">
              <Gauge size={13} /> Forecast Details
            </p>
            <div className="mt-2">
              <InfoRow label="Confidence" value={confidence != null ? `${confidence}%` : '—'} />
              <InfoRow label="Data Points" value={`${orderCount} order${orderCount === 1 ? '' : 's'} analyzed`} />
              <InfoRow label="Forecast Horizon" value={periodLabel || '—'} />
              <InfoRow label="Last Updated" value={lastUpdated ? formatRelativeTime(lastUpdated) : '—'} />
            </div>
          </div>
        </div>
      </motion.section>
    </div>
  );
}
