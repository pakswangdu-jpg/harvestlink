import { useMemo } from 'react';
import {
  Area, CartesianGrid, ComposedChart, Line, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { LineChart as LineChartIcon } from 'lucide-react';
import ForecastTooltip from './ForecastTooltip';
import { formatCurrency } from '../../utils/formatters';

const CHART_HEIGHT = 280;
// Below this, a "trend line" is really just 1-2 dots — the empty state is more honest and
// more useful than a chart that looks broken.
const MIN_HISTORICAL_POINTS = 3;

function formatAxisDate(dateIso, todayIso) {
  if (dateIso === todayIso) return 'Today';
  const parsed = new Date(dateIso);
  if (Number.isNaN(parsed.getTime())) return dateIso;
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// A plain solid dot, no glow/pulse — this report's visual language deliberately avoids
// glowing or floating decoration (see MarketAnalysisReport.jsx); the dashed reference line
// plus this marker is enough to place "today" without drawing extra attention to itself.
function TodayDot({ cx, cy }) {
  if (cx == null || cy == null) return null;
  return <circle cx={cx} cy={cy} r={4} fill="#F59E0B" stroke="#fff" strokeWidth={2} />;
}

function EmptyHistoryState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14 text-center" style={{ height: CHART_HEIGHT }}>
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-50 text-gray-300">
        <LineChartIcon size={26} strokeWidth={1.5} />
      </span>
      <p className="max-w-xs text-[15px] font-medium text-gray-600">
        Not enough historical order data to display a meaningful trend.
      </p>
      <p className="max-w-xs text-[13px] text-gray-400">
        Historical records will appear automatically after completed customer orders.
      </p>
    </div>
  );
}

// Merges two independently-sourced series onto one shared date axis: `historicalChart` (real
// past order prices — plus real PSA annual reference points when order history is thin, see
// forecast.controller.js, marked source: 'psa') and `forecastCurve` (the engine's real
// confidence-banded projection, see priceForecastEngine.js). Historical stays solid green,
// forecast stays a plain blue line — no fill, no gradient, never blended into one line, so
// it's always visually clear which numbers are real recorded sales and which are the model's
// projection. The confidence band is the one shaded region on the chart, drawn as two
// stacked flat-color areas (an invisible one up to `lower`, a visible one spanning
// `upper - lower`) — informational (a real uncertainty range), not decorative.
export default function ForecastChart({ historicalChart, forecastCurve, unit }) {
  const todayIso = forecastCurve?.[0]?.date || null;
  // forecastCurve[0] is always today's real baseline value (see priceForecastEngine.js's
  // buildForecastSeries — dayOffset 0 is never projected/noised), so it's a reliable "Today"
  // anchor the moment there's a forecast at all. A LINE/band, though, needs at least 2 points
  // to mean anything — a period like "Today" (0 days ahead) legitimately produces just that
  // one point, which is real but isn't a trend to draw.
  const hasForecastAnchor = (forecastCurve?.length || 0) >= 1;
  const hasForecastTrend = (forecastCurve?.length || 0) >= 2;

  const data = useMemo(() => {
    const byDate = new Map();

    const historicalByDate = new Map();
    (historicalChart || []).forEach((point) => {
      const bucket = historicalByDate.get(point.date) || { prices: [], source: point.source };
      bucket.prices.push(point.price);
      historicalByDate.set(point.date, bucket);
    });
    historicalByDate.forEach(({ prices, source }, date) => {
      const average = prices.reduce((sum, price) => sum + price, 0) / prices.length;
      byDate.set(date, { date, historicalPrice: Math.round(average * 100) / 100, source });
    });

    (forecastCurve || []).forEach((point) => {
      const existing = byDate.get(point.date) || { date: point.date };
      existing.forecastPrice = point.price;
      existing.upper = point.upper;
      existing.lower = point.lower;
      existing.confidence = point.confidence;
      existing.reason = point.reason;
      if (point.upper != null && point.lower != null) {
        existing.bandBase = point.lower;
        existing.bandWidth = point.upper - point.lower;
      }
      byDate.set(point.date, existing);
    });

    return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  }, [historicalChart, forecastCurve]);

  // Nothing meaningful to plot at all — neither a real historical trend nor a real forecast
  // trend, just at most a stray dot or two. Showing the honest empty state beats a chart
  // that looks broken.
  const showEmptyState = (historicalChart?.length || 0) < MIN_HISTORICAL_POINTS && !hasForecastTrend;

  if (showEmptyState) return <EmptyHistoryState />;

  const todayRow = data.find((row) => row.date === todayIso);
  // Prefer the forecast's own day-0 value (always real, always present whenever there's a
  // forecast at all) over a same-day historical order, which is coincidental and often just
  // won't exist — anchoring the "Today" marker to it meant the marker silently failed to
  // render on the (common) days without a completed order dated today.
  const todayValue = todayRow?.forecastPrice ?? todayRow?.historicalPrice ?? null;

  return (
    <div style={{ height: CHART_HEIGHT }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#F3F4F6" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 12, fill: '#6B7280' }}
            axisLine={{ stroke: '#E5E7EB' }}
            tickLine={false}
            tickFormatter={(value) => formatAxisDate(value, todayIso)}
            minTickGap={20}
          />
          <YAxis
            tick={{ fontSize: 12, fill: '#6B7280' }}
            axisLine={false}
            tickLine={false}
            width={56}
            tickFormatter={(value) => `₱${Math.round(value)}`}
            domain={['auto', 'auto']}
          />
          <Tooltip content={<ForecastTooltip data={data} mode="price" unit={unit} todayIso={todayIso} />} />

          {hasForecastTrend ? (
            <>
              <Area dataKey="bandBase" stackId="band" stroke="none" fill="transparent" isAnimationActive={false} connectNulls />
              <Area
                dataKey="bandWidth"
                name="Confidence Band"
                stackId="band"
                stroke="none"
                fill="#16A34A"
                fillOpacity={0.08}
                isAnimationActive
                animationDuration={700}
                connectNulls
              />
            </>
          ) : null}

          <Line
            type="monotone"
            dataKey="historicalPrice"
            name="Historical"
            stroke="#16A34A"
            strokeWidth={2}
            dot={{ r: 3, fill: '#16A34A', strokeWidth: 0 }}
            activeDot={{ r: 5 }}
            connectNulls
            isAnimationActive
            animationDuration={700}
          />

          {hasForecastTrend ? (
            <Line
              type="monotone"
              dataKey="forecastPrice"
              name="Forecast"
              stroke="#2563EB"
              strokeWidth={2}
              strokeDasharray="5 3"
              dot={{ r: 3, fill: '#2563EB', strokeWidth: 0 }}
              activeDot={{ r: 5 }}
              connectNulls
              isAnimationActive
              animationDuration={700}
            />
          ) : null}

          {hasForecastAnchor && todayIso ? (
            <ReferenceLine
              x={todayIso}
              stroke="#9CA3AF"
              strokeDasharray="3 3"
              strokeWidth={1}
              label={{
                value: todayValue != null ? `Today · ${formatCurrency(todayValue)}` : 'Today',
                position: 'insideTopRight',
                fontSize: 11,
                fontWeight: 600,
                fill: '#6B7280',
              }}
            />
          ) : null}

          {hasForecastAnchor && todayIso && todayValue != null ? (
            <ReferenceDot x={todayIso} y={todayValue} shape={<TodayDot />} isFront />
          ) : null}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
