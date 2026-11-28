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
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  if (num === 0) return '0';
  if (Math.abs(num) < 1) return num.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  return num.toLocaleString('en-PH', { maximumFractionDigits: 1 });
}

function formatAxisDate(dateIso, todayIso) {
  if (dateIso === todayIso) return 'Today';
  const parsed = new Date(dateIso);
  if (Number.isNaN(parsed.getTime())) return dateIso;
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}



function TodayDot({ cx, cy }) {
  if (cx == null || cy == null) return null;
  return <circle cx={cx} cy={cy} r={4} fill="var(--amber-700)" stroke="var(--panel)" strokeWidth={2} />;
}

function EmptyHistoryState({ height = CHART_HEIGHT }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-8 text-center" style={{ height }}>
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







export default function DemandChart({ historicalChart, forecastCurve, unit = 'unit', height = CHART_HEIGHT }) {
  const todayIso = forecastCurve?.[0]?.date || null;


  const hasForecastAnchor = (forecastCurve?.length || 0) >= 1;
  const hasForecastTrend = (forecastCurve?.length || 0) >= 2;

  const data = useMemo(() => {
    const byDate = new Map();

    (historicalChart || []).forEach((point) => {
      const volume = Number(point?.volume);
      if (!point?.date || !Number.isFinite(volume)) return;
      byDate.set(point.date, { date: point.date, historicalVolume: volume });
    });

    (forecastCurve || []).forEach((point) => {
      if (!point?.date) return;
      const existing = byDate.get(point.date) || { date: point.date };
      const volume = point.volume != null ? Number(point.volume) : null;
      existing.forecastVolume = Number.isFinite(volume) ? volume : null;
      existing.confidence = point.confidence;
      existing.reason = point.reason;
      if (point.upper != null && point.lower != null) {
        const upper = Number(point.upper);
        const lower = Number(point.lower);
        if (Number.isFinite(upper) && Number.isFinite(lower)) {
          existing.bandBase = lower;
          existing.bandWidth = Math.max(0, upper - lower);
        }
      }
      byDate.set(point.date, existing);
    });



    const bridgeDateIso = forecastCurve?.[0]?.date;
    if (bridgeDateIso) {
      const bridgeRow = byDate.get(bridgeDateIso);
      if (bridgeRow && bridgeRow.historicalVolume == null && bridgeRow.forecastVolume != null) {
        bridgeRow.historicalVolume = bridgeRow.forecastVolume;
      }
    }

    return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  }, [historicalChart, forecastCurve]);

  const showEmptyState = (historicalChart?.length || 0) < MIN_HISTORICAL_POINTS && !hasForecastTrend;
  if (showEmptyState) return <EmptyHistoryState height={height} />;

  const todayRow = data.find((row) => row.date === todayIso);
  const todayValue = todayRow?.forecastVolume ?? todayRow?.historicalVolume ?? null;

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height={height} minWidth={0} initialDimension={{ width: 480, height }}>
        <ComposedChart data={data} margin={{ top: 24, right: 16, left: 2, bottom: 2 }}>
          <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: 'var(--muted)' }}
            axisLine={{ stroke: 'var(--line)' }}
            tickLine={false}
            tickFormatter={(value) => formatAxisDate(value, todayIso)}
            minTickGap={22}
          />
          <YAxis
            tick={{ fontSize: 11, fill: 'var(--muted)' }}
            axisLine={false}
            tickLine={false}
            width={44}
            tickCount={4}
            tickFormatter={formatVolume}
            domain={[0, 'auto']}
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
                isAnimationActive={false}
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
            isAnimationActive={false}
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
              isAnimationActive={false}
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
                position: 'top',
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
