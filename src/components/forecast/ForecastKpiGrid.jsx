import { motion } from 'framer-motion';
import {
  Award, Bot, CloudRain, DollarSign, Minus, Sprout, TrendingDown, TrendingUp,
} from 'lucide-react';
import ProgressBar from '../common/ProgressBar';
import { formatCurrency } from '../../utils/formatters';

const TREND_STYLE = {
  Rising: { icon: TrendingUp, color: 'text-green-700', bg: 'bg-green-50' },
  Falling: { icon: TrendingDown, color: 'text-red-700', bg: 'bg-red-50' },
  Steady: { icon: Minus, color: 'text-amber-700', bg: 'bg-amber-50' },
};

const RISK_STYLE = {
  Low: { color: 'text-green-700', bg: 'bg-green-50' },
  Medium: { color: 'text-amber-700', bg: 'bg-amber-50' },
  High: { color: 'text-red-700', bg: 'bg-red-50' },
};

function rainWarning(weather) {
  if (!weather || weather.rainfallProbability == null) return 'No rainfall data available';
  if (weather.rainfallProbability >= 60) return `${weather.rainfallProbability}% chance of heavy rain`;
  if (weather.rainfallProbability >= 30) return `${weather.rainfallProbability}% chance of rain`;
  return 'Clear skies expected';
}

function Card({ children }) {
  return (
    <motion.article
      whileHover={{ y: -3 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow duration-200 hover:shadow-md"
    >
      {children}
    </motion.article>
  );
}

function CardHeader({ icon: Icon, iconBg, iconColor, label }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconBg} ${iconColor}`}>
        <Icon size={18} strokeWidth={2} />
      </span>
      <p className="text-[12px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
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
        <CardHeader icon={Sprout} iconBg="bg-green-50" iconColor="text-green-700" label="High Demand Crops" />
        <p className="text-[28px] font-bold leading-none text-gray-900">{highDemandCrops.length}</p>
        <p className="line-clamp-2 text-[13px] text-gray-500">
          {highDemandCrops.length ? highDemandCrops.map((entry) => entry.crop).join(', ') : 'No crops currently in high demand'}
        </p>
      </Card>

      <Card>
        <CardHeader icon={DollarSign} iconBg="bg-green-50" iconColor="text-green-700" label="Average Forecast Price" />
        <p className="text-[28px] font-bold leading-none text-gray-900">
          {averageForecastPrice != null ? formatCurrency(averageForecastPrice) : '—'}
        </p>
        {averagePriceChangePercent != null ? (
          <p className={`text-[13px] font-semibold ${averagePriceChangePercent >= 0 ? 'text-green-700' : 'text-red-700'}`}>
            {averagePriceChangePercent > 0 ? '+' : ''}{averagePriceChangePercent}% · {periodLabel}
          </p>
        ) : <p className="text-[13px] text-gray-500">{periodLabel}</p>}
      </Card>

      <Card>
        <CardHeader icon={Award} iconBg="bg-amber-50" iconColor="text-amber-700" label="Best Crop" />
        <p className="text-[22px] font-bold leading-tight text-gray-900">{bestCrop?.crop || '—'}</p>
        <p className="text-[13px] font-semibold text-green-700">
          {bestCrop?.expectedChangePercent != null
            ? `${bestCrop.expectedChangePercent > 0 ? '+' : ''}${bestCrop.expectedChangePercent}% expected profit`
            : 'No standout crop yet'}
        </p>
      </Card>

      <Card>
        <CardHeader icon={TrendIcon} iconBg={trendStyle.bg} iconColor={trendStyle.color} label="Market Trend" />
        <p className={`text-[24px] font-bold leading-none ${trendStyle.color}`}>{marketTrend}</p>
        <p className="text-[13px] text-gray-500">Across every crop shown</p>
      </Card>

      <Card>
        <CardHeader icon={CloudRain} iconBg={riskStyle.bg} iconColor={riskStyle.color} label="Weather Risk" />
        <p className={`text-[24px] font-bold leading-none ${riskStyle.color}`}>{weatherRiskLevel}</p>
        <p className="text-[13px] text-gray-500">{rainWarning(weather)}</p>
      </Card>

      <Card>
        <CardHeader icon={Bot} iconBg="bg-green-50" iconColor="text-green-700" label="AI Confidence" />
        <p className="text-[28px] font-bold leading-none text-gray-900">
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
