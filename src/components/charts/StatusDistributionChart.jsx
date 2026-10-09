import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import Select from '../admin/Select';
import EmptyState from '../admin/EmptyState';

const CHART_HEIGHT = 220;
const ALL_TIME = 'all';





const STATUS_COLORS = {
  completed: 'var(--green-700)',
  pending: 'var(--amber-700)',
  confirmed: 'var(--muted)',
  cancelled: 'var(--red-700)',
  rejected: 'var(--red-700)',
  available: 'var(--muted)',
  requested: 'var(--amber-700)',
  scheduled: 'var(--muted)',
  farmer: 'var(--green-800)',
  buyer: 'var(--muted)',
  stakeholder: 'var(--amber-700)',
  admin: 'var(--text)',
};
const DEFAULT_COLOR = 'var(--muted)';

function AxisTick({ x, y, payload, report = false, slanted = false }) {
  if (slanted) {
    return <g transform={`translate(${x},${y + 10})`}><text transform="rotate(-35)" textAnchor="end" fontSize={12} fill="var(--reports-secondary)">{payload.value}</text></g>;
  }
  const words = String(payload.value).split(' ');
  return (
    <g transform={`translate(${x},${y})`}>
      <text textAnchor="middle" fontSize={12} fill={report ? 'var(--reports-secondary)' : 'var(--muted)'}>
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
    <div className="rounded-md border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-[12px] shadow-sm">
      <p className="font-medium text-[var(--text)]">{entry.label}</p>
      <p className="text-[var(--muted)]">{entry.count} {entry.count === 1 ? 'entry' : 'entries'}</p>
    </div>
  );
}

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



export default function StatusDistributionChart({ records, dateKey = 'createdAt', computeBreakdown, presentation, title, description, emptyMessage, hidePeriodFilter = false }) {
  const report = presentation === 'report';
  const [activeIndex, setActiveIndex] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(ALL_TIME);
  const [plotWidth, setPlotWidth] = useState(0);

  const monthOptions = useMemo(() => buildMonthOptions(records, dateKey), [records, dateKey]);

  const filteredRecords = useMemo(() => {
    if (hidePeriodFilter || selectedMonth === ALL_TIME) return records;
    const option = monthOptions.find((item) => item.value === selectedMonth);
    if (!option) return records;
    return records.filter((record) => {
      const date = new Date(record[dateKey]);
      return date.getFullYear() === option.year && date.getMonth() === option.month;
    });
  }, [records, monthOptions, selectedMonth, dateKey, hidePeriodFilter]);

  const data = useMemo(() => computeBreakdown(filteredRecords), [computeBreakdown, filteredRecords]);
  const slantedLabels = report && plotWidth > 0 && plotWidth < 380 && data.length > 3;

  return (
    <>
      <div className={report ? 'reports-chart-header' : 'mb-3 flex justify-end'}>
        {report && title ? <div><h2>{title}</h2>{description ? <p className="reports-description">{description}</p> : null}</div> : null}
        {!hidePeriodFilter ? <Select
          value={selectedMonth}
          onChange={(event) => setSelectedMonth(event.target.value)}
          aria-label="Filter by month"
          className="!w-auto"
        >
          <option value={ALL_TIME}>All time</option>
          {monthOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </Select> : null}
      </div>
      {data.length ? (
        <div className={report ? 'reports-status-plot' : undefined} style={{ height: CHART_HEIGHT }}>
          <ResponsiveContainer width="100%" height="100%" onResize={report ? (width) => setPlotWidth(width) : undefined}>
            <BarChart
              data={data}
              margin={{ top: report ? 28 : 20, right: report ? 12 : 4, left: report ? 12 : 4, bottom: 0 }}
              onMouseMove={(state) => setActiveIndex(state?.isTooltipActive ? state.activeTooltipIndex : null)}
              onMouseLeave={() => setActiveIndex(null)}
            >
              <CartesianGrid vertical={false} stroke="var(--line)" />
              <XAxis
                dataKey="label"
                axisLine={{ stroke: 'var(--line)' }}
                tickLine={false}
                interval={0}
                height={slantedLabels ? 62 : report ? 46 : 36}
                tick={<AxisTick report={report} slanted={slantedLabels} />}
              />
              <Tooltip cursor={{ fill: 'var(--soft)' }} content={<ChartTooltip />} />
              <Bar dataKey="count" radius={[3, 3, 0, 0]} maxBarSize={40} isAnimationActive={!report} animationDuration={300} animationEasing="ease-out">
                {data.map((entry, index) => (
                  <Cell
                    key={entry.key}
                    fill={report && STATUS_COLORS[entry.status] ? `var(--reports-${entry.status})` : STATUS_COLORS[entry.status] || DEFAULT_COLOR}
                    opacity={activeIndex === null || activeIndex === index ? 1 : 0.55}
                    style={{ transition: 'opacity 0.15s ease' }}
                  />
                ))}
                <LabelList dataKey="count" position="top" style={{ fontSize: 12, fontWeight: 600, fill: 'var(--text)' }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <EmptyState compact={report} title="No data yet" message={emptyMessage || 'Nothing to report here for this period.'} />
      )}
    </>
  );
}
