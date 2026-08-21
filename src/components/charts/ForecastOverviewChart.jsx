import {
  Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

const CHART_HEIGHT = 320;
const POSITIVE_COLOR = 'var(--green-600)';
const NEGATIVE_COLOR = 'var(--red-700)';

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const entry = payload[0].payload;
  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-elevated)] px-3.5 py-2.5 shadow-md">
      <p className="text-[13px] font-semibold text-[var(--text)]">{entry.crop}</p>
      <p className="text-[13px] text-[var(--muted)]">
        {entry.changePercent > 0 ? '+' : ''}{entry.changePercent}% forecast price change
      </p>
    </div>
  );
}

// Ranks crops by their forecasted price-change % for whichever period is currently
// selected (see backend/src/controllers/forecast.controller.js's expectedChangePercent) —
// every bar re-renders with a fresh value on every period switch, never a static snapshot.
export default function ForecastOverviewChart({ data, periodLabel }) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-7 shadow-sm">
      <p className="text-[12px] font-semibold uppercase tracking-widest text-[var(--green-700)]">Forecast Overview</p>
      <h2 className="mt-1 text-[26px] font-bold text-[var(--text)]">{periodLabel} Forecast Overview</h2>

      {data.length ? (
        <div className="mt-6" style={{ height: CHART_HEIGHT }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 24, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--line)" />
              <XAxis dataKey="crop" tick={{ fontSize: 12, fill: 'var(--muted)' }} axisLine={{ stroke: 'var(--line)' }} tickLine={false} interval={0} height={40} />
              <YAxis tick={{ fontSize: 12, fill: 'var(--muted)' }} axisLine={false} tickLine={false} width={48} tickFormatter={(value) => `${value}%`} />
              <ReferenceLine y={0} stroke="var(--line)" />
              <Tooltip cursor={{ fill: 'var(--soft)' }} content={<ChartTooltip />} />
              <Bar dataKey="changePercent" radius={[6, 6, 6, 6]} maxBarSize={40} animationDuration={600} animationEasing="ease-out">
                {data.map((entry) => (
                  <Cell key={entry.crop} fill={entry.changePercent >= 0 ? POSITIVE_COLOR : NEGATIVE_COLOR} />
                ))}
                <LabelList
                  dataKey="changePercent"
                  position="top"
                  formatter={(value) => `${value > 0 ? '+' : ''}${value}%`}
                  style={{ fontSize: 12, fontWeight: 700, fill: 'var(--text)' }}
                />
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
