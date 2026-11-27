import {
  Activity, Bot, Check, ClipboardList, Gauge, Lightbulb, Minus, Sprout, TrendingDown, TrendingUp, Waves,
} from 'lucide-react';
import './MarketAnalysisReport.css';
import {
  cropActionRecommendation, formatCurrency, formatDate, formatRelativeTime, harvestActionLabel, sellWindowLabel,
} from '../../utils/formatters';

const SECTION_CLASS = 'rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5 sm:p-7';
const SECTION_TITLE_CLASS = 'text-[22px] font-semibold leading-tight text-[var(--text)]';




function splitIntoSentences(text) {
  if (!text) return [];
  return text.split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim()).filter(Boolean);
}




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
    Sell: 'Good selling opportunity',
    Hold: 'Wait and monitor',
    Plant: 'Consider planting',
    Harvest: 'Harvest soon',
  };
  const chips = [ACTION_CHIP[action] || 'Monitor Market'];
  if (forecast.bestTimeToHarvest) chips.push(harvestActionLabel(forecast.bestTimeToHarvest));
  if (forecast.bestTimeToSell) chips.push(sellWindowLabel(forecast.bestTimeToSell));
  return [...new Set(chips)];
}




function buildRecommendationDetails(forecast) {
  const {
    recommendation, seasonalImpact, weatherImpact, expectedProfit, expectedChangePercent, unit, bestTimeToSell,
  } = forecast;

  const weatherClause = weatherImpact && !weatherImpact.startsWith('Favorable') && !weatherImpact.startsWith('No weather')
    ? weatherImpact
    : null;
  const why = [seasonalImpact, weatherClause].filter(Boolean).join(' ')
    || 'Based on current demand and supply signals for this crop.';

  const priceOutlook = expectedProfit != null
    ? `The forecast is ${expectedProfit >= 0 ? '+' : '−'}${formatCurrency(Math.abs(expectedProfit))}${unit ? `/${unit}` : ''} `
      + `(${expectedChangePercent > 0 ? '+' : ''}${expectedChangePercent}%) from the reference price. This is a price difference estimate, not profit.`
    : 'Not enough price data to estimate a price difference.';

  const when = bestTimeToSell ? sellWindowLabel(bestTimeToSell) : 'Not enough data to recommend a specific window yet.';

  return { what: recommendation, why, priceOutlook, when };
}

function buildRecommendationFactors(forecast) {
  const factors = [];
  if (forecast.signal === 'opportunity') {
    factors.push('Buyer demand is high relative to active listings.');
  } else if (forecast.signal === 'steady') {
    factors.push('Recent buyer demand is being met by current listings.');
  } else if (forecast.signal === 'none') {
    factors.push('There has been limited recent buyer demand.');
  }

  if (forecast.expectedChangePercent != null) {
    const direction = forecast.expectedChangePercent > 0
      ? 'increasing'
      : forecast.expectedChangePercent < 0 ? 'decreasing' : 'holding steady';
    factors.push(`The forecast reference price is ${direction} by ${Math.abs(forecast.expectedChangePercent)}% over the selected period.`);
  }

  if (forecast.marketTrend === 'increasing') factors.push('The current market trend is rising.');
  if (forecast.marketTrend === 'decreasing') factors.push('The current market trend is falling.');
  if (forecast.marketTrend === 'stable') factors.push('The current market trend is steady.');

  if (forecast.seasonalImpact) factors.push(`Seasonality: ${forecast.seasonalImpact}`);
  if (forecast.weatherImpact
    && !forecast.weatherImpact.toLowerCase().includes('no weather')
    && !forecast.weatherImpact.toLowerCase().includes('unavailable')) {
    factors.push(`Weather: ${forecast.weatherImpact}`);
  }
  return factors;
}

const TREND_META = {
  increasing: { label: 'Rising', icon: TrendingUp, tone: 'text-[var(--green-700)]' },
  decreasing: { label: 'Falling', icon: TrendingDown, tone: 'text-[var(--red-700)]' },
  stable: { label: 'Steady', icon: Minus, tone: 'text-[var(--text)]' },
};
const DEMAND_NOTE = {
  'Very High': 'Well above typical demand', High: 'Higher than seasonal average', Moderate: 'In line with seasonal average', Low: 'Below seasonal average',
};
const SUPPLY_NOTE = { High: 'Ample active listings', Moderate: 'Adequate harvest availability', Low: 'Limited harvest availability' };
const RISK_NOTE = { Low: 'Stable conditions', Medium: 'Moderate price swings expected', High: 'Significant price swings possible' };
const RISK_TONE = { Low: 'text-[var(--green-700)]', Medium: 'text-[var(--amber-700)]', High: 'text-[var(--red-700)]' };
function MetricTile({
  icon: Icon, label, value, tone = 'text-[var(--text)]', supporting,
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 text-[var(--muted)]">
        <Icon size={14} strokeWidth={2} />
        <span className="text-[14px] font-medium text-[var(--text-secondary)]">{label}</span>
      </div>
        <p className={`text-[26px] font-semibold leading-tight ${tone}`}>{value}</p>
        {supporting ? <p className="text-[14px] leading-snug text-[var(--text-secondary)]">{supporting}</p> : null}
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="grid grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)] items-start gap-3 border-b border-[var(--line)] py-3 text-[14px] last:border-b-0 sm:grid-cols-[minmax(110px,0.7fr)_minmax(0,1.3fr)]">
      <dt className="leading-relaxed text-[var(--text-secondary)]">{label}</dt>
      <dd className="min-w-0 text-right font-medium leading-relaxed text-[var(--text)]">{value}</dd>
    </div>
  );
}





export default function MarketAnalysisReport({ detail, municipality, periodLabel }) {
  if (!detail) return null;

  const {
    crop, unit, expectedChangePercent, marketTrend,
    forecastDemand, supplyLevel, riskLevel, priceVolatilityPercent, confidence, orderCount,
    weatherImpact, seasonalImpact, historicalAveragePrice, lastUpdated, aiSummary, aiRecommendation,
  } = detail;

  const summaryLines = aiSummary ? splitIntoSentences(aiSummary) : buildDeterministicSummary(detail);
  const trendMeta = TREND_META[marketTrend] || TREND_META.stable;
  const changeLabel = expectedChangePercent != null ? `${expectedChangePercent > 0 ? '+' : ''}${expectedChangePercent}%` : '—';
  const chips = buildRecommendationChips(detail);
  const recDetails = buildRecommendationDetails(detail);
  const recommendationFactors = buildRecommendationFactors(detail);

  return (
    <div className="forecast-report flex flex-col gap-5 sm:gap-6">
      {                }
      <section className={SECTION_CLASS}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--green-50)] text-[var(--green-700)]">
              <Bot size={16} strokeWidth={2} />
            </span>
            <div>
              <h2 className={SECTION_TITLE_CLASS}>Selected crop outlook</h2>
              <p className="mt-1 text-[15px] text-[var(--text-secondary)]">{crop} · {municipality || 'All municipalities'}</p>
            </div>
          </div>
          <span className="text-[14px] font-medium text-[var(--text-secondary)]">
            Updated {detail.lastUpdated ? formatRelativeTime(detail.lastUpdated) : 'recently'}
          </span>
        </div>

        <div className="mt-5 flex flex-col gap-3 border-t border-[var(--line)] pt-5">
          {summaryLines.map((line) => (
            <p key={line} className="text-[16px] leading-relaxed text-[var(--text-secondary)]">{line}</p>
          ))}
        </div>
      </section>

      {                 }
      <section className={SECTION_CLASS}>
        <h2 className={SECTION_TITLE_CLASS}>Key metrics</h2>
        <div className="mt-5 grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
          <MetricTile icon={trendMeta.icon} label="Market Trend" value={trendMeta.label} tone={trendMeta.tone} supporting={changeLabel} />
          <MetricTile icon={Sprout} label="Demand" value={forecastDemand} supporting={DEMAND_NOTE[forecastDemand]} />
          <MetricTile icon={Waves} label="Supply" value={supplyLevel} supporting={SUPPLY_NOTE[supplyLevel]} />
          <MetricTile
            icon={Activity}
            label="Risk"
            value={riskLevel}
            tone={RISK_TONE[riskLevel] || 'text-[var(--text)]'}
            supporting={`${RISK_NOTE[riskLevel] || ''}${priceVolatilityPercent != null ? ` (${priceVolatilityPercent}% volatility)` : ''}`}
          />
        </div>
      </section>


      {                       }
      <section className={SECTION_CLASS}>
        <div className="flex items-start gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--green-50)] text-[var(--green-700)]">
            <Lightbulb size={16} strokeWidth={2} />
          </span>
          <h2 className={SECTION_TITLE_CLASS}>Recommended action</h2>
        </div>

        <div className="mt-5 flex flex-wrap gap-2.5">
          {chips.map((chip) => (
            <span key={chip} className="inline-flex min-h-10 items-center rounded-full border border-[var(--line)] bg-[var(--soft)] px-4 py-1.5 text-[14px] font-medium text-[var(--text-secondary)]">
              {chip}
            </span>
          ))}
        </div>

        <div className="forecast-action-details mt-5 grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
          <div className="forecast-action-primary sm:col-span-2">
            <p className="text-[14px] font-semibold text-[var(--green-700)]">Recommendation</p>
            <p className="mt-1 text-[16px] font-medium leading-relaxed text-[var(--text)]">{aiRecommendation || recDetails.what}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-[15px] font-semibold text-[var(--text)]">Why this recommendation?</p>
            {recommendationFactors.length ? (
              <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {recommendationFactors.map((factor) => (
                  <li key={factor} className="flex items-start gap-2 text-[15px] leading-relaxed text-[var(--text-secondary)]">
                    <Check size={17} aria-hidden="true" className="mt-1 shrink-0 text-[var(--green-700)]" />
                    <span>{factor}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-[15px] leading-relaxed text-[var(--text-secondary)]">{recDetails.why}</p>
            )}
          </div>
          <div>
            <p className="text-[14px] font-semibold text-[var(--text-secondary)]">Price outlook</p>
            <p className="mt-1 text-[16px] leading-relaxed text-[var(--text-secondary)]">{recDetails.priceOutlook}</p>
          </div>
          <div>
            <p className="text-[14px] font-semibold text-[var(--text-secondary)]">When to sell</p>
            <p className="mt-1 text-[16px] leading-relaxed text-[var(--text-secondary)]">{recDetails.when}</p>
          </div>
        </div>
      </section>

      {                            }
      <section className={SECTION_CLASS}>
        <h2 className={SECTION_TITLE_CLASS}>Supporting information</h2>
        <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div>
            <p className="flex items-center gap-2 text-[15px] font-semibold text-[var(--text)]">
              <ClipboardList size={17} className="text-[var(--green-700)]" /> Prediction factors
            </p>
            <dl className="forecast-info-rows mt-3">
              <InfoRow label="Weather" value={weatherImpact || '—'} />
              <InfoRow label="Seasonality" value={seasonalImpact || '—'} />
              <InfoRow label="Historical Prices" value={historicalAveragePrice != null ? `${formatCurrency(historicalAveragePrice)}${unit ? `/${unit}` : ''} avg` : 'No recorded orders yet'} />
              <InfoRow label="Supply" value={supplyLevel || '—'} />
              <InfoRow label="Demand" value={forecastDemand || '—'} />
            </dl>
          </div>
          <div>
            <p className="flex items-center gap-2 text-[15px] font-semibold text-[var(--text)]">
              <Gauge size={17} className="text-[var(--green-700)]" /> Forecast details
            </p>
            <dl className="forecast-info-rows mt-3">
              <InfoRow label="Confidence" value={confidence != null ? `${confidence}%` : '—'} />
              <InfoRow label="Data Points" value={`${orderCount} order${orderCount === 1 ? '' : 's'} analyzed`} />
              <InfoRow label="Forecast Horizon" value={periodLabel || '—'} />
              <InfoRow label="Last Updated" value={lastUpdated ? formatRelativeTime(lastUpdated) : '—'} />
            </dl>
          </div>
        </div>
      </section>
    </div>
  );
}
