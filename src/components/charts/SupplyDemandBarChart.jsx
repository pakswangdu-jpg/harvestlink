import {
  Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { LineChart } from 'lucide-react';
import './SupplyDemandBarChart.css';

const CHART_HEIGHT = 260;

const STATUS_STYLE = {
  opportunity: 'text-[var(--green-700)]',
  steady: 'text-[var(--amber-700)]',
  none: 'text-[var(--muted)]',
};

const STATUS_LABEL = {
  opportunity: 'Demand is high relative to active listings',
  steady: 'Buyer demand is within current supply',
  none: 'No recent buyer demand',
};

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const entry = payload[0]?.payload;
  if (!entry) return null;

  return (
    <div className="max-w-[280px] rounded-lg border border-[var(--line)] bg-[var(--surface-elevated)] px-4 py-3 shadow-lg">
      <p className="text-[14px] font-semibold text-[var(--text)]">{entry.crop}</p>
      <dl className="mt-2 space-y-1 text-[14px]">
        <div className="flex items-center justify-between gap-5">
          <dt className="text-[var(--muted)]">Buyer orders</dt>
          <dd className="font-semibold text-[var(--text)]">{entry.demand}</dd>
        </div>
        <div className="flex items-center justify-between gap-5">
          <dt className="text-[var(--muted)]">Active listings</dt>
          <dd className="font-semibold text-[var(--text)]">{entry.supply}</dd>
        </div>
      </dl>
      <p className={`mt-2 border-t border-[var(--line)] pt-2 text-[13px] font-medium ${STATUS_STYLE[entry.signal] || STATUS_STYLE.none}`}>
        {STATUS_LABEL[entry.signal] || STATUS_LABEL.none}
      </p>
    </div>
  );
}

function CropTick({ x, y, payload }) {
  const lines = String(payload.value).match(/.{1,13}(?:\s|$)|\S{1,13}/g) || [];
  return (
    <text x={x - 8} y={y} textAnchor="end" fill="var(--muted)" fontSize={12}>
      {lines.map((line, index) => <tspan key={index} x={x - 8} dy={index === 0 ? 4 - (lines.length - 1) * 7 : 14}>{line.trim()}</tspan>)}
    </text>
  );
}

function AlternatingBackground({ x, y, width, height, index }) {
  if (index % 2 !== 0) return null;
  return <rect x={x} y={y} width={width} height={height} fill="var(--soft)" rx={6} />;
}

export default function SupplyDemandBarChart({ data }) {
  const hasMeaningfulData = data.some((entry) => entry.demand > 0 || entry.supply > 0);
  const opportunity = data.find((entry) => entry.signal === 'opportunity');

  return (
    <section className="supply-demand-panel min-w-0 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5 sm:p-6" aria-labelledby="supply-demand-title">
      <h2 id="supply-demand-title" className="text-[20px] font-semibold text-[var(--text)]">Marketplace demand activity</h2>
      <p className="mt-1 text-[14px] leading-relaxed text-[var(--muted)]">
        Compare recent buyer orders with active farmer listings.
      </p>

      {hasMeaningfulData ? (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[14px] font-medium text-[var(--text-secondary)]">
            <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-[var(--blue-700)]" /> Buyer orders</span>
            <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-[var(--green-600)]" /> Active listings</span>
          </div>

          <div
            className="supply-demand-plot mt-3"
            role="group"
            aria-label="Bar chart comparing buyer orders and active listings for each crop. Counts use separate measures."
            style={{ height: Math.max(CHART_HEIGHT, data.length * 68 + 36) }}
          >
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <BarChart
                data={data}
                layout="vertical"
                margin={{ top: 8, right: 32, left: 0, bottom: 0 }}
                barGap={4}
                barCategoryGap="24%"
              >
                <CartesianGrid vertical horizontal={false} stroke="var(--line)" strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  tick={{ fontSize: 12, fill: 'var(--muted)' }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                  height={36}
                  allowDecimals={false}
                  minTickGap={24}
                />
                <YAxis
                  type="category"
                  dataKey="crop"
                  tick={<CropTick />}
                  axisLine={false}
                  tickLine={false}
                  width={104}
                  interval={0}
                  allowDecimals={false}
                />
                <Tooltip cursor={{ fill: 'transparent' }} content={<ChartTooltip />} />
                <Bar
                  dataKey="demand"
                  name="Buyer orders"
                  fill="var(--blue-700)"
                  radius={[0, 3, 3, 0]}
                  maxBarSize={36}
                  animationDuration={700}
                  animationEasing="ease-out"
                  background={<AlternatingBackground />}
                >
                  <LabelList dataKey="demand" position="right" style={{ fontSize: 13, fontWeight: 600, fill: 'var(--blue-700)' }} />
                </Bar>
                <Bar
                  dataKey="supply"
                  name="Active listings"
                  fill="var(--green-600)"
                  radius={[0, 3, 3, 0]}
                  maxBarSize={36}
                  animationDuration={700}
                  animationEasing="ease-out"
                  background={<AlternatingBackground />}
                >
                  <LabelList dataKey="supply" position="right" style={{ fontSize: 13, fontWeight: 600, fill: 'var(--green-700)' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {opportunity ? (
            <p className="mt-3 rounded-md bg-[var(--soft)] px-4 py-3 text-[15px] leading-relaxed text-[var(--text-secondary)]">
              <span className="font-semibold text-[var(--text)]">Market opportunity: </span>
              {opportunity.crop} currently has buyer demand outpacing active listings. This may indicate a stronger selling opportunity.
            </p>
          ) : null}
        </>
      ) : (
        <div className="mt-4 flex flex-col items-center justify-center gap-2 py-10 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--soft)] text-[var(--text-faint)]">
            <LineChart size={22} strokeWidth={1.5} />
          </span>
          <p className="max-w-xs text-[14px] font-medium text-[var(--text-secondary)]">
            Not enough market activity to compare buyer orders and active listings.
          </p>
        </div>
      )}
    </section>
  );
}
