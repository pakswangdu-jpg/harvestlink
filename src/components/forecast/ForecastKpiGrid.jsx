import {
  Activity, Award, CloudRain, Gauge, Minus, Sprout, TrendingDown, TrendingUp,
} from 'lucide-react';
import ProgressBar from '../common/ProgressBar';

const TREND_STYLE = {
  Rising: { icon: TrendingUp, color: 'text-[var(--green-700)]' },
  Falling: { icon: TrendingDown, color: 'text-[var(--red-700)]' },
  Steady: { icon: Minus, color: 'text-[var(--amber-700)]' },
  Unavailable: { icon: Minus, color: 'text-[var(--muted)]' },
};

const RISK_STYLE = {
  Low: 'text-[var(--green-700)]',
  Medium: 'text-[var(--amber-700)]',
  High: 'text-[var(--red-700)]',
  Unavailable: 'text-[var(--muted)]',
};

function SummaryMetric({ icon: Icon, label, children }) {
  return (
    <article className="flex min-w-0 flex-col gap-3 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5">
      <p className="flex items-center gap-2 text-[14px] font-medium text-[var(--text-secondary)]">
        <Icon size={18} aria-hidden="true" className="shrink-0 text-[var(--green-700)]" />
        {label}
      </p>
      <div className="min-w-0">{children}</div>
    </article>
  );
}

export default function ForecastKpiGrid({
  highDemandCrops, averagePriceChangePercent,
  bestCrop, marketTrend, weather, weatherRiskLevel, averageConfidence, periodLabel, onViewHighDemand,
}) {
  const trendStyle = TREND_STYLE[marketTrend] || TREND_STYLE.Steady;
  const TrendIcon = trendStyle.icon;
  const confidenceTone = averageConfidence >= 70 ? 'green' : averageConfidence >= 50 ? 'amber' : 'red';
  const confidenceLevel = averageConfidence == null
    ? null
    : averageConfidence >= 70 ? 'Higher' : averageConfidence >= 50 ? 'Moderate' : 'Limited';

  return (
    <section aria-label="Forecast summary">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SummaryMetric icon={Sprout} label="High-demand crops">
          <p className="text-[30px] font-semibold leading-none tracking-tight text-[var(--text)]">{highDemandCrops.length}</p>
          {highDemandCrops.length ? (
            <button
              type="button"
              onClick={onViewHighDemand}
              style={{ background: 'transparent', border: 0, padding: 0, color: 'var(--green-700)', minHeight: 44 }}
              className="mt-2 block w-full text-left text-[14px] font-medium leading-relaxed underline-offset-2 hover:underline focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--green-600)]"
            >
              View {highDemandCrops.length} crop{highDemandCrops.length === 1 ? '' : 's'} with demand opportunities
            </button>
          ) : (
            <p className="mt-2 text-[15px] leading-relaxed text-[var(--text-secondary)]">No demand opportunities in this selection.</p>
          )}
        </SummaryMetric>

        <SummaryMetric icon={Activity} label="Average expected price change">
          <p className={`text-[30px] font-semibold leading-tight tracking-tight ${
            averagePriceChangePercent == null ? 'text-[var(--muted)]' : averagePriceChangePercent >= 0 ? 'text-[var(--green-700)]' : 'text-[var(--red-700)]'
          }`}
          >
            {averagePriceChangePercent != null
              ? `${averagePriceChangePercent > 0 ? '+' : ''}${averagePriceChangePercent}%`
              : 'Not available'}
          </p>
          <p className="mt-2 text-[14px] leading-relaxed text-[var(--text-secondary)]">
            {averagePriceChangePercent != null ? `Across priced crops · ${periodLabel}` : `No price changes available · ${periodLabel}`}
          </p>
        </SummaryMetric>

        <SummaryMetric icon={Award} label="Strongest price outlook">
          <p className="truncate text-[24px] font-semibold leading-tight tracking-tight text-[var(--text)]">{bestCrop?.crop || 'Not available'}</p>
          <p className={`mt-2 text-[14px] font-medium leading-relaxed ${
            bestCrop?.expectedChangePercent == null ? 'text-[var(--muted)]' : bestCrop.expectedChangePercent >= 0 ? 'text-[var(--green-700)]' : 'text-[var(--red-700)]'
          }`}
          >
            {bestCrop?.expectedChangePercent != null
              ? `${bestCrop.expectedChangePercent > 0 ? '+' : ''}${bestCrop.expectedChangePercent}% expected price change`
              : 'No price estimate available'}
          </p>
        </SummaryMetric>

        <SummaryMetric icon={TrendIcon} label="Overall price trend">
          <p className={`text-[26px] font-semibold leading-tight tracking-tight ${trendStyle.color}`}>{marketTrend}</p>
          <p className="mt-2 text-[14px] leading-relaxed text-[var(--text-secondary)]">
            {marketTrend === 'Unavailable' ? 'No price forecasts available' : 'Based on crops with a price forecast'}
          </p>
        </SummaryMetric>

        <SummaryMetric icon={CloudRain} label="Rainfall risk">
          <p className={`text-[26px] font-semibold leading-tight tracking-tight ${RISK_STYLE[weatherRiskLevel] || RISK_STYLE.Unavailable}`}>
            {weather ? weatherRiskLevel : 'Unavailable'}
          </p>
          <p className="mt-2 text-[14px] leading-relaxed text-[var(--text-secondary)]">
            {weather?.rainfallProbability != null
              ? `${weather.rainfallProbability}% chance of rain`
              : 'No rainfall estimate available'}
          </p>
        </SummaryMetric>

        <SummaryMetric icon={Gauge} label="Forecast confidence">
          <p className="text-[26px] font-semibold leading-tight tracking-tight text-[var(--text)]">
            {averageConfidence != null ? `${averageConfidence}% · ${confidenceLevel}` : 'Not available'}
          </p>
          {averageConfidence != null ? (
            <div className="mt-3">
              <ProgressBar
                value={averageConfidence}
                tone={confidenceTone}
                label="Forecast confidence score"
              />
            </div>
          ) : null}
          <p className="mt-2 text-[14px] leading-relaxed text-[var(--text-secondary)]">
            Reflects the amount and consistency of available market, price, and weather data.
          </p>
        </SummaryMetric>
      </div>
    </section>
  );
}
