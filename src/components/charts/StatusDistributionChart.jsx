import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis } from 'recharts';

const CHART_HEIGHT = 280;
const ALL_TIME = 'all';

// Centralized so "Orders by status" and "Donations by status" (the only two charts driving
// this component today) always render the same status in the same color, even though each
// pulls from a different status vocabulary (order vs. donation lifecycle).
const STATUS_COLORS = {
  completed: '#16A34A',
  pending: '#F59E0B',
  confirmed: '#3B82F6',
  cancelled: '#DC2626',
  rejected: '#EF4444',
  available: '#8B5CF6',
  requested: '#10B981',
  scheduled: '#3B82F6',
  // User roles — a different vocabulary than order/donation statuses, but colors never
  // collide between them, so they share the same lookup.
  farmer: '#16A34A',
  buyer: '#3B82F6',
  stakeholder: '#8B5CF6',
  admin: '#F59E0B',
};
const DEFAULT_COLOR = '#6B7280';

// Recharts doesn't wrap axis tick text on its own — a plain centered <text> node is exactly
// what let "Donation completed"/"Pickup scheduled" collide with their neighbors in the old
// hand-rolled chart. Splitting on spaces onto their own <tspan> lines keeps every label
// legible regardless of how many categories share the row.
function AxisTick({ x, y, payload }) {
  const words = String(payload.value).split(' ');
  return (
    <g transform={`translate(${x},${y})`}>
      <text textAnchor="middle" fontSize={13} fontWeight={500} fill="#6B7280">
        {words.map((word) => (
          <tspan key={word} x={0} dy={14}>{word}</tspan>
        ))}
      </text>
    </g>
  );
}

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const entry = payload[0].payload;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3.5 py-2.5 shadow-md">
      <p className="text-[13px] font-semibold text-gray-900">{entry.label}</p>
      <p className="text-[13px] text-gray-500">{entry.count} {entry.count === 1 ? 'entry' : 'entries'}</p>
    </div>
  );
}

// Builds the month dropdown's options from whatever records actually exist — newest first —
// so there's never a selectable month with nothing in it.
function buildMonthOptions(records, dateKey) {
  const seen = new Map();
  records.forEach((record) => {
    const date = new Date(record[dateKey]);
    if (Number.isNaN(date.getTime())) return;
    const key = `${date.getFullYear()}-${String(date.getMonth()).padStart(2, '0')}`;
    if (!seen.has(key)) {
      seen.set(key, {
        value: key,
        year: date.getFullYear(),
        month: date.getMonth(),
        label: date.toLocaleDateString('en-PH', { month: 'short', year: 'numeric' }),
      });
    }
  });
  return [...seen.values()].sort((a, b) => (a.year === b.year ? b.month - a.month : b.year - a.year));
}

// Shared shell for every "breakdown by status" chart on the admin Reports page — same card,
// typography, height, grid, animation, month filter, and status color mapping for all of
// them; only the eyebrow/title/records/breakdown logic differ per caller.
export default function StatusDistributionChart({ eyebrow, title, records, dateKey = 'createdAt', computeBreakdown }) {
  const [activeIndex, setActiveIndex] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(ALL_TIME);

  const monthOptions = useMemo(() => buildMonthOptions(records, dateKey), [records, dateKey]);

  const filteredRecords = useMemo(() => {
    if (selectedMonth === ALL_TIME) return records;
    const option = monthOptions.find((item) => item.value === selectedMonth);
    if (!option) return records;
    return records.filter((record) => {
      const date = new Date(record[dateKey]);
      return date.getFullYear() === option.year && date.getMonth() === option.month;
    });
  }, [records, monthOptions, selectedMonth, dateKey]);

  const data = useMemo(() => computeBreakdown(filteredRecords), [computeBreakdown, filteredRecords]);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-7 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-widest text-green-700">{eyebrow}</p>
          <h2 className="mt-1 text-[26px] font-bold text-gray-900">{title}</h2>
        </div>
        <select
          value={selectedMonth}
          onChange={(event) => setSelectedMonth(event.target.value)}
          aria-label={`Filter ${title} by month`}
          className="h-9 shrink-0 rounded-lg border border-gray-200 bg-white px-3 text-[13px] font-medium text-gray-700 outline-none transition-colors duration-200 focus:border-green-600"
        >
          <option value={ALL_TIME}>All time</option>
          {monthOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>

      {data.length ? (
        <div className="mt-6" style={{ height: CHART_HEIGHT }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ top: 28, right: 8, left: 8, bottom: 0 }}
              onMouseMove={(state) => setActiveIndex(state?.isTooltipActive ? state.activeTooltipIndex : null)}
              onMouseLeave={() => setActiveIndex(null)}
            >
              <CartesianGrid vertical={false} stroke="#F3F4F6" />
              <XAxis
                dataKey="label"
                axisLine={{ stroke: '#E5E7EB' }}
                tickLine={false}
                interval={0}
                height={40}
                tick={<AxisTick />}
              />
              <Tooltip cursor={{ fill: '#F9FAFB' }} content={<ChartTooltip />} />
              <Bar dataKey="count" radius={[8, 8, 0, 0]} maxBarSize={56} animationDuration={600} animationEasing="ease-out">
                {data.map((entry, index) => (
                  <Cell
                    key={entry.key}
                    fill={STATUS_COLORS[entry.status] || DEFAULT_COLOR}
                    opacity={activeIndex === null || activeIndex === index ? 1 : 0.55}
                    style={{ transition: 'opacity 0.2s ease' }}
                  />
                ))}
                <LabelList dataKey="count" position="top" style={{ fontSize: 14, fontWeight: 700, fill: '#111827' }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="empty-state compact mt-6">
          <h3>No data yet</h3>
          <p>Nothing to report here for this period.</p>
        </div>
      )}
    </div>
  );
}
