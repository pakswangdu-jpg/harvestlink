import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { formatCurrency } from '../../utils/formatters';
import EmptyState from '../admin/EmptyState';

const CHART_HEIGHT = 220;

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-[#D0D7DE] bg-white px-3 py-2 text-[12px] shadow-sm">
      <p className="font-medium text-[#24292F]">{label}</p>
      <p className="text-[#57606A]">{formatCurrency(payload[0].value)}</p>
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
          <CartesianGrid vertical={false} stroke="#EAEEF2" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 12, fill: '#57606A' }}
            axisLine={{ stroke: '#D0D7DE' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 12, fill: '#57606A' }}
            axisLine={false}
            tickLine={false}
            width={64}
            tickFormatter={(value) => formatCurrency(value)}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: '#D0D7DE' }} />
          <Line
            type="monotone"
            dataKey="revenue"
            stroke="#166534"
            strokeWidth={1.75}
            dot={{ r: 2.5, fill: '#166534', strokeWidth: 0 }}
            activeDot={{ r: 4 }}
            isAnimationActive
            animationDuration={300}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
