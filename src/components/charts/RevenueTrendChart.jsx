import { useId } from 'react';
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { formatCurrency } from '../../utils/formatters';
import EmptyState from '../admin/EmptyState';

const CHART_HEIGHT = 240;

function formatAxisValue(value) {
  if (Math.abs(value) >= 1000) return `₱${Math.round(value / 1000)}k`;
  return formatCurrency(value);
}

function ChartTooltip({ active, payload, label, seriesLabel = 'paid order income' }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="revenue-chart-tooltip">
      <p className="revenue-chart-tooltip-label">Revenue - {seriesLabel}</p>
      <strong>{formatCurrency(payload[0].value)}</strong>
      <span>{payload[0].payload?.fullLabel || label} · paid order income</span>
    </div>
  );
}




export default function RevenueTrendChart({ points, compact = false, seriesLabel = 'paid order income', presentation }) {
  const report = presentation === 'report';
  const gradientId = `revenue-area-${useId().replace(/:/g, '')}`;
  const chartHeight = compact ? 132 : report ? 280 : CHART_HEIGHT;

  if (!points.some((point) => point.revenue > 0)) {
    return <EmptyState compact={compact} title="No revenue yet" message="Paid orders will chart here once buyers start checking out." />;
  }

  return (
    <div className={`revenue-chart${compact ? ' revenue-chart-compact' : ''}`} style={{ height: chartHeight }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: report ? 20 : 10, right: report ? 16 : 8, left: 0, bottom: 4 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--green-600)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--green-600)" stopOpacity={0.03} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="3 3" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: compact ? 10 : report ? 12 : 11, fill: report ? 'var(--reports-secondary)' : 'var(--muted)' }}
            axisLine={{ stroke: 'var(--line)' }}
            tickLine={false}
            tickMargin={8}
          />
          <YAxis
            tick={{ fontSize: compact ? 10 : report ? 12 : 11, fill: report ? 'var(--reports-secondary)' : 'var(--muted)' }}
            axisLine={false}
            tickLine={false}
            width={compact ? 52 : 64}
            tickFormatter={formatAxisValue}
          />
          <Tooltip
            content={<ChartTooltip seriesLabel={seriesLabel} />}
            cursor={{ stroke: 'var(--muted)', strokeDasharray: '4 4', strokeWidth: 1 }}
            offset={16}
            animationDuration={120}
            allowEscapeViewBox={{ x: true, y: true }}
          />
          <Area
            type="monotone"
            dataKey="revenue"
            stroke="var(--green-800)"
            strokeWidth={2.25}
            fill={report ? 'var(--green-600)' : `url(#${gradientId})`}
            fillOpacity={report ? 0.08 : 1}
            dot={{ r: compact ? 2.5 : 3, fill: 'var(--green-800)', stroke: 'var(--panel)', strokeWidth: 2 }}
            activeDot={{ r: compact ? 4 : 5, fill: 'var(--green-800)', stroke: 'var(--panel)', strokeWidth: 2 }}
            isAnimationActive={!report}
            animationDuration={300}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
