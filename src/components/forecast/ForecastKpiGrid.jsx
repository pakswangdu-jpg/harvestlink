import {
  Award, Bot, CloudRain, DollarSign, Minus, Sprout, TrendingDown, TrendingUp,
} from 'lucide-react';
import ProgressBar from '../common/ProgressBar';
import { formatCurrency } from '../../utils/formatters';

const TREND_STYLE = {
  Rising: { icon: TrendingUp, color: 'text-[var(--green-700)]' },
  Falling: { icon: TrendingDown, color: 'text-[var(--red-700)]' },
  Steady: { icon: Minus, color: 'text-[var(--amber-700)]' },
};

const RISK_STYLE = {
  Low: { color: 'text-[var(--green-700)]' },
  Medium: { color: 'text-[var(--amber-700)]' },
  High: { color: 'text-[var(--red-700)]' },
};

function rainWarning(weather) {
  if (!weather || weather.rainfallProbability == null) return 'No rainfall data available';
  if (weather.rainfallProbability >= 60) return `${weather.rainfallProbability}% chance of heavy rain`;
  if (weather.rainfallProbability >= 30) return `${weather.rainfallProbability}% chance of rain`;
  return 'Clear skies expected';
}

function Card({ children }) {
  return (
    <article className="flex flex-col gap-3 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5">
      {children}
    </article>
  );
}

function CardHeader({ icon: Icon, iconColor, label }) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon size={20} strokeWidth={2} className={`shrink-0 ${iconColor}`} />
      <p className="text-[12px] font-semibold uppercase tracking-wide text-[var(--muted)]">{label}</p>
    </div>
  );
}

// Section 2 — six premium KPI cards, every value already computed by the page from real
// getDemandForecast data (see FarmerDemandForecast.jsx). This component only formats and
// lays them out; it derives nothing new.
export default function ForecastKpiGrid({
  highDemandCrops, averageForecastPrice, averagePriceChangePercent,
  bestCrop, marketTrend, weather, weatherRiskLevel, averageConfidence, periodLabel,
}) {
  const trendStyle = TREND_STYLE[marketTrend] || TREND_STYLE.Steady;
  const TrendIcon = trendStyle.icon;
  const riskStyle = RISK_STYLE[weatherRiskLevel] || RISK_STYLE.Low;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Card>
        <CardHeader icon={Sprout} iconColor="text-[var(--green-700)]" label="High Demand Crops" />
        <p className="text-[28px] font-bold leading-none text-[var(--text)]">{highDemandCrops.length}</p>
        <p className="line-clamp-2 text-[13px] text-[var(--muted)]">
          {highDemandCrops.length ? highDemandCrops.map((entry) => entry.crop).join(', ') : 'No crops currently in high demand'}
        </p>
      </Card>

      <Card>
        <CardHeader icon={DollarSign} iconColor="text-[var(--green-700)]" label="Average Forecast Price" />
        <p className="text-[28px] font-bold leading-none text-[var(--text)]">
          {averageForecastPrice != null ? formatCurrency(averageForecastPrice) : '—'}
        </p>
        {averagePriceChangePercent != null ? (
          <p className={`text-[13px] font-semibold ${averagePriceChangePercent >= 0 ? 'text-[var(--green-700)]' : 'text-[var(--red-700)]'}`}>
            {averagePriceChangePercent > 0 ? '+' : ''}{averagePriceChangePercent}% · {periodLabel}
          </p>
        ) : <p className="text-[13px] text-[var(--muted)]">{periodLabel}</p>}
      </Card>

      <Card>
        <CardHeader icon={Award} iconColor="text-[var(--amber-700)]" label="Best Crop" />
        <p className="text-[22px] font-bold leading-tight text-[var(--text)]">{bestCrop?.crop || '—'}</p>
        <p className="text-[13px] font-semibold text-[var(--green-700)]">
          {bestCrop?.expectedChangePercent != null
            ? `${bestCrop.expectedChangePercent > 0 ? '+' : ''}${bestCrop.expectedChangePercent}% expected profit`
            : 'No standout crop yet'}
        </p>
      </Card>

      <Card>
        <CardHeader icon={TrendIcon} iconColor={trendStyle.color} label="Market Trend" />
        <p className={`text-[24px] font-bold leading-none ${trendStyle.color}`}>{marketTrend}</p>
        <p className="text-[13px] text-[var(--muted)]">Across every crop shown</p>
      </Card>

      <Card>
        <CardHeader icon={CloudRain} iconColor={riskStyle.color} label="Weather Risk" />
        <p className={`text-[24px] font-bold leading-none ${riskStyle.color}`}>{weatherRiskLevel}</p>
        <p className="text-[13px] text-[var(--muted)]">{rainWarning(weather)}</p>
      </Card>

      <Card>
        <CardHeader icon={Bot} iconColor="text-[var(--green-700)]" label="AI Confidence" />
        <p className="text-[28px] font-bold leading-none text-[var(--text)]">
          {averageConfidence != null ? `${averageConfidence}%` : '—'}
        </p>
        <ProgressBar
          value={averageConfidence || 0}
          tone={averageConfidence >= 70 ? 'green' : averageConfidence >= 50 ? 'amber' : 'red'}
          label="AI confidence score"
        />
      </Card>
    </div>
  );
}
