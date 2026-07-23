import { useId, useMemo } from 'react';
import {
  Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { LineChart as LineChartIcon } from 'lucide-react';
import { formatCurrency, sellWindowLabel } from '../../utils/formatters';

const CHART_HEIGHT = 320;
// Below this, a "trend line" is really just 1-2 dots — the empty state is more honest and
// more useful than a chart that looks broken.
const MIN_HISTORICAL_POINTS = 3;

function formatAxisDate(dateIso, todayIso, tomorrowIso) {
  if (dateIso === todayIso) return 'Today';
  if (dateIso === tomorrowIso) return 'Tomorrow';
  const parsed = new Date(dateIso);
  if (Number.isNaN(parsed.getTime())) return dateIso;
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatLongDate(dateIso) {
  const parsed = new Date(dateIso);
  if (Number.isNaN(parsed.getTime())) return dateIso;
  return parsed.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

// Weather/recommendation only ever appear for today-or-later points — a genuinely past
// historical price wasn't influenced by today's weather reading or the current
// recommendation, so attaching either to it would misrepresent what actually produced that
// real recorded number.
function ChartTooltip({
  active, payload, todayIso, currentPrice, unit, weatherImpact, sellLabel,
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  const isForecastSegment = todayIso != null && point.date >= todayIso;
  const changePercent = point.forecastPrice != null && currentPrice
    ? Math.round(((point.forecastPrice - currentPrice) / currentPrice) * 1000) / 10
    : null;

  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-lg">
      <p className="text-[13px] font-semibold text-gray-900">{formatLongDate(point.date)}</p>
      <div className="mt-2 flex flex-col gap-1">
        {point.historicalPrice != null ? (
          <p className="text-[13px] text-green-700">
            Historical Price: <span className="font-semibold">{formatCurrency(point.historicalPrice)}{unit ? `/${unit}` : ''}</span>
          </p>
        ) : null}
        {point.forecastPrice != null ? (
          <p className="text-[13px] text-blue-700">
            Forecast Price: <span className="font-semibold">{formatCurrency(point.forecastPrice)}{unit ? `/${unit}` : ''}</span>
          </p>
        ) : null}
        {changePercent != null ? (
          <p className={`text-[13px] font-semibold ${changePercent >= 0 ? 'text-green-700' : 'text-red-700'}`}>
            {changePercent >= 0 ? 'Expected Increase' : 'Expected Decrease'}: {changePercent > 0 ? '+' : ''}{changePercent}%
          </p>
        ) : null}
        {isForecastSegment && weatherImpact ? (
          <p className="text-[12px] text-gray-500">Weather: {weatherImpact}</p>
        ) : null}
        {isForecastSegment && sellLabel ? (
          <p className="text-[12px] text-gray-500">Recommendation: {sellLabel}</p>
        ) : null}
      </div>
    </div>
  );
}

function EmptyHistoryState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14 text-center" style={{ height: CHART_HEIGHT }}>
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-50 text-gray-300">
        <LineChartIcon size={26} strokeWidth={1.5} />
      </span>
      <p className="max-w-xs text-[14px] font-semibold text-gray-600">
        Not enough historical order data to display a meaningful trend.
      </p>
      <p className="max-w-xs text-[13px] text-gray-400">
        Historical records will appear automatically after completed customer orders.
      </p>
    </div>
  );
}

// Merges two independently-sourced series onto one shared date axis: `historicalChart`
// (real past order prices, possibly several same-day orders averaged into one point) and
// `forecastCurve` (the trend engine's real projected points, see priceForecastEngine.js).
// The two series are never blended into a single line — historical stays solid, forecast
// stays dashed, so it's always visually clear which numbers are real recorded sales and
// which are the model's projection.
export default function PriceForecastChart({
  historicalChart, forecastCurve, todayIso, eyebrow = 'Price Trend', title = 'Historical & Forecast Price',
  currentPrice, unit, weatherImpact, bestTimeToSell,
}) {
  const data = useMemo(() => {
    const byDate = new Map();

    const historicalByDate = new Map();
    historicalChart.forEach((point) => {
      const bucket = historicalByDate.get(point.date) || [];
      bucket.push(point.price);
      historicalByDate.set(point.date, bucket);
    });
    historicalByDate.forEach((prices, date) => {
      const average = prices.reduce((sum, price) => sum + price, 0) / prices.length;
      byDate.set(date, { date, historicalPrice: Math.round(average * 100) / 100 });
    });

    forecastCurve.forEach((point) => {
      const existing = byDate.get(point.date) || { date: point.date };
      existing.forecastPrice = point.price;
      byDate.set(point.date, existing);
    });

    return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  }, [historicalChart, forecastCurve]);

  const tomorrowIso = useMemo(() => {
    if (!todayIso) return null;
    const date = new Date(todayIso);
    date.setDate(date.getDate() + 1);
    return date.toISOString().slice(0, 10);
  }, [todayIso]);

  const isHistoricalOnly = forecastCurve.length === 0;
  const showEmptyState = isHistoricalOnly && historicalChart.length < MIN_HISTORICAL_POINTS;
  const sellLabel = bestTimeToSell ? sellWindowLabel(bestTimeToSell) : null;

  // Unique per mounted instance (this component renders twice at once — Price tab and
  // Historical tab both use it) so their SVG gradient defs never collide in the DOM.
  const gradientId = useId();
  const historicalGradientId = `${gradientId}-historical`;
  const forecastGradientId = `${gradientId}-forecast`;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-widest text-green-700">{eyebrow}</p>
          <h3 className="mt-1 text-[20px] font-bold text-gray-900">{title}</h3>
        </div>
        {!showEmptyState ? (
          <div className="flex flex-wrap items-center gap-4 text-[12px] font-medium text-gray-500">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-green-600" /> Historical Prices</span>
            {!isHistoricalOnly ? (
              <>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-blue-600" /> AI Forecast</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-500" /> Today</span>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      {showEmptyState ? (
        <EmptyHistoryState />
      ) : (
        <div className="mt-5" style={{ height: CHART_HEIGHT }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={historicalGradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#16A34A" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#16A34A" stopOpacity={0} />
                </linearGradient>
                <linearGradient id={forecastGradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="#F3F4F6" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12, fill: '#6B7280' }}
                axisLine={{ stroke: '#E5E7EB' }}
                tickLine={false}
                tickFormatter={(value) => formatAxisDate(value, todayIso, tomorrowIso)}
              />
              <YAxis
                tick={{ fontSize: 12, fill: '#6B7280' }}
                axisLine={false}
                tickLine={false}
                width={56}
                tickFormatter={(value) => `₱${Math.round(value)}`}
              />
              <Tooltip
                content={(
                  <ChartTooltip
                    todayIso={todayIso}
                    currentPrice={currentPrice}
                    unit={unit}
                    weatherImpact={weatherImpact}
                    sellLabel={sellLabel}
                  />
                )}
              />
              {!isHistoricalOnly && todayIso ? (
                <ReferenceLine
                  x={todayIso}
                  stroke="#F59E0B"
                  strokeDasharray="4 4"
                  label={{ value: 'TODAY', position: 'insideTopRight', fontSize: 11, fontWeight: 700, fill: '#B45309' }}
                />
              ) : null}
              <Area
                type="monotone"
                dataKey="historicalPrice"
                name="Historical"
                stroke="#16A34A"
                strokeWidth={2.5}
                fill={`url(#${historicalGradientId})`}
                dot={{ r: 3, fill: '#16A34A', strokeWidth: 0 }}
                activeDot={{ r: 5 }}
                connectNulls
                isAnimationActive
                animationDuration={700}
              />
              {!isHistoricalOnly ? (
                <Area
                  type="monotone"
                  dataKey="forecastPrice"
                  name="Forecast"
                  stroke="#3B82F6"
                  strokeWidth={2.5}
                  strokeDasharray="6 4"
                  fill={`url(#${forecastGradientId})`}
                  dot={{ r: 5, fill: '#3B82F6', strokeWidth: 0 }}
                  activeDot={{ r: 7 }}
                  connectNulls
                  isAnimationActive
                  animationDuration={700}
                />
              ) : null}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
