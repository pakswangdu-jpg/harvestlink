import { useMemo } from 'react';
import {
  Area, CartesianGrid, ComposedChart, Line, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Activity } from 'lucide-react';
import ForecastTooltip from './ForecastTooltip';

const CHART_HEIGHT = 280;
const MIN_HISTORICAL_POINTS = 3;

function formatVolume(value) {
  if (value == null) return '—';
  return Number(value).toLocaleString('en-PH', { maximumFractionDigits: 1 });
}

function formatAxisDate(dateIso, todayIso) {
  if (dateIso === todayIso) return 'Today';
  const parsed = new Date(dateIso);
  if (Number.isNaN(parsed.getTime())) return dateIso;
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// A plain solid dot, no glow/pulse — matches ForecastChart.jsx's deliberately unadorned
// "today" marker.
function TodayDot({ cx, cy }) {
  if (cx == null || cy == null) return null;
  return <circle cx={cx} cy={cy} r={4} fill="var(--amber-700)" stroke="var(--panel)" strokeWidth={2} />;
}

function EmptyHistoryState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14 text-center" style={{ height: CHART_HEIGHT }}>
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--soft)] text-[var(--text-faint)]">
        <Activity size={26} strokeWidth={1.5} />
      </span>
      <p className="max-w-xs text-[15px] font-medium text-[var(--text-secondary)]">
        Not enough historical order data to display a meaningful demand trend.
      </p>
      <p className="max-w-xs text-[13px] text-[var(--muted)]">
        Historical records will appear automatically after completed customer orders.
      </p>
    </div>
  );
}

// Same merge-onto-one-date-axis + stacked-band approach as ForecastChart.jsx, applied to
// order VOLUME instead of price: `historicalChart` is real recorded weekly order volume,
// `forecastCurve` is the demand engine's real confidence-banded projected daily rate (see
// priceForecastEngine.js). Historical stays solid green, forecast stays a plain dashed blue
// line — no fill, no gradient — with the confidence band as the one shaded (flat-color,
// informational) region on the chart.
export default function DemandChart({ historicalChart, forecastCurve, unit = 'unit' }) {
  const todayIso = forecastCurve?.[0]?.date || null;
  // Same reasoning as ForecastChart.jsx: forecastCurve[0] is always today's real baseline
  // rate, a reliable "Today" anchor on its own — a LINE/band needs at least 2 points.
  const hasForecastAnchor = (forecastCurve?.length || 0) >= 1;
  const hasForecastTrend = (forecastCurve?.length || 0) >= 2;

  const data = useMemo(() => {
    const byDate = new Map();

    (historicalChart || []).forEach((point) => {
      byDate.set(point.date, { date: point.date, historicalVolume: point.volume });
    });

    (forecastCurve || []).forEach((point) => {
      const existing = byDate.get(point.date) || { date: point.date };
      existing.forecastVolume = point.volume;
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

  const showEmptyState = (historicalChart?.length || 0) < MIN_HISTORICAL_POINTS && !hasForecastTrend;
  if (showEmptyState) return <EmptyHistoryState />;

  const todayRow = data.find((row) => row.date === todayIso);
  const todayValue = todayRow?.forecastVolume ?? todayRow?.historicalVolume ?? null;

  return (
    <div style={{ height: CHART_HEIGHT }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 12, fill: 'var(--muted)' }}
            axisLine={{ stroke: 'var(--line)' }}
            tickLine={false}
            tickFormatter={(value) => formatAxisDate(value, todayIso)}
            minTickGap={20}
          />
          <YAxis
            tick={{ fontSize: 12, fill: 'var(--muted)' }}
            axisLine={false}
            tickLine={false}
            width={48}
            tickFormatter={formatVolume}
            domain={['auto', 'auto']}
          />
          <Tooltip content={<ForecastTooltip data={data} mode="demand" unit={unit} todayIso={todayIso} />} />

          {hasForecastTrend ? (
            <>
              <Area dataKey="bandBase" stackId="band" stroke="none" fill="transparent" isAnimationActive={false} connectNulls />
              <Area
                dataKey="bandWidth"
                name="Confidence Band"
                stackId="band"
                stroke="none"
                fill="var(--green-600)"
                fillOpacity={0.08}
                isAnimationActive
                animationDuration={700}
                connectNulls
              />
            </>
          ) : null}

          <Line
            type="monotone"
            dataKey="historicalVolume"
            name="Historical"
            stroke="var(--green-600)"
            strokeWidth={2}
            dot={{ r: 3, fill: 'var(--green-600)', strokeWidth: 0 }}
            activeDot={{ r: 5 }}
            connectNulls
            isAnimationActive
            animationDuration={700}
          />

          {hasForecastTrend ? (
            <Line
              type="monotone"
              dataKey="forecastVolume"
              name="Forecast"
              stroke="var(--blue-700)"
              strokeWidth={2}
              strokeDasharray="5 3"
              dot={{ r: 3, fill: 'var(--blue-700)', strokeWidth: 0 }}
              activeDot={{ r: 5 }}
              connectNulls
              isAnimationActive
              animationDuration={700}
            />
          ) : null}

          {hasForecastAnchor && todayIso ? (
            <ReferenceLine
              x={todayIso}
              stroke="var(--muted)"
              strokeDasharray="3 3"
              strokeWidth={1}
              label={{
                value: todayValue != null ? `Today · ${formatVolume(todayValue)} ${unit}/day` : 'Today',
                position: 'insideTopRight',
                fontSize: 11,
                fontWeight: 600,
                fill: 'var(--muted)',
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
