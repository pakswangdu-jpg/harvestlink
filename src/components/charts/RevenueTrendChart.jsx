import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { formatCurrency } from '../../utils/formatters';
import EmptyState from '../admin/EmptyState';

const CHART_HEIGHT = 220;

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-[12px] shadow-sm">
      <p className="font-medium text-[var(--text)]">{label}</p>
      <p className="text-[var(--muted)]">{formatCurrency(payload[0].value)}</p>
    </div>
  );
}

// Plain line chart — no gradient fill, no spring-animated callouts. Same real
// monthlyRevenue data as before (see getMonthlyRevenue in reportService.js), just presented
// the way an internal ops dashboard would rather than a marketing chart.
export default function RevenueTrendChart({ points }) {
  if (!points.some((point) => point.revenue > 0)) {
    return <EmptyState title="No revenue yet" message="Paid orders will chart here once buyers start checking out." />;
  }

  return (
    <div style={{ height: CHART_HEIGHT }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 12, fill: 'var(--muted)' }}
            axisLine={{ stroke: 'var(--line)' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 12, fill: 'var(--muted)' }}
            axisLine={false}
            tickLine={false}
            width={64}
            tickFormatter={(value) => formatCurrency(value)}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'var(--line)' }} />
          <Line
            type="monotone"
            dataKey="revenue"
            stroke="var(--green-800)"
            strokeWidth={1.75}
            dot={{ r: 2.5, fill: 'var(--green-800)', strokeWidth: 0 }}
            activeDot={{ r: 4 }}
            isAnimationActive
            animationDuration={300}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
