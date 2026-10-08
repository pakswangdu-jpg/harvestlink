import { useMemo, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Bot, LineChart, Sprout } from 'lucide-react';
import './SupplyDemandBarChart.css';

const CHART_HEIGHT = 260;

const STATUS_STYLE = {
  'High Demand': 'text-[var(--green-700)]',
  'Low Demand': 'text-[var(--red-700)]',
  Balanced: 'text-[var(--amber-700)]',
};




function computeStatus(demand, supply) {
  if (demand > supply) return 'High Demand';
  if (demand < supply) return 'Low Demand';
  return 'Balanced';
}

function computeTooltipRecommendation(status) {
  if (status === 'High Demand') return 'Harvest and sell now because demand is higher than supply.';
  if (status === 'Low Demand') return 'Supply is outpacing demand — consider holding or diversifying before listing more.';
  return 'Demand and supply are evenly matched — maintain current listing levels.';
}

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const entry = payload[0]?.payload;
  if (!entry) return null;
  const difference = entry.demand - entry.supply;
  const status = computeStatus(entry.demand, entry.supply);

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-elevated)] px-4 py-3 shadow-lg">
      <p className="text-[13px] font-semibold text-[var(--text)]">{entry.crop}</p>
      <div className="mt-2 flex flex-col gap-1 text-[13px]">
        <p className="text-[var(--blue-700)]">Demand: <span className="font-semibold">{entry.demand} Order{entry.demand === 1 ? '' : 's'}</span></p>
        <p className="text-[var(--green-700)]">Supply: <span className="font-semibold">{entry.supply} Listing{entry.supply === 1 ? '' : 's'}</span></p>
        <p className={`font-semibold ${difference >= 0 ? 'text-[var(--green-700)]' : 'text-[var(--red-700)]'}`}>
          Difference: {difference > 0 ? '+' : ''}{difference}
        </p>
        <p className={`font-semibold ${STATUS_STYLE[status]}`}>Market Status: {status}</p>
        <p className="mt-1 text-[12px] leading-relaxed text-[var(--muted)]">{computeTooltipRecommendation(status)}</p>
      </div>
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

function SummaryCard({ icon: Icon, label, children }) {
  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-2.5">
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
        <Icon size={11} /> {label}
      </p>
      {children}
    </div>
  );
}






export default function SupplyDemandBarChart({ data }) {
  const [chartWidth, setChartWidth] = useState(0);
  const compact = chartWidth < Math.max(480, data.length * 100);
  const hasMeaningfulData = data.some((entry) => entry.demand > 0 || entry.supply > 0);

  const summary = useMemo(() => {
    if (!hasMeaningfulData) return null;
    const totalDemand = data.reduce((sum, entry) => sum + entry.demand, 0);
    const totalSupply = data.reduce((sum, entry) => sum + entry.supply, 0);
    const overallStatus = computeStatus(totalDemand, totalSupply);
    const bestToSell = [...data].sort((a, b) => (b.demand - b.supply) - (a.demand - a.supply))[0];
    const lowestDemand = [...data].sort((a, b) => a.demand - b.demand)[0];

    const recommendation = lowestDemand.crop !== bestToSell.crop
      ? `Continue selling ${bestToSell.crop}. ${lowestDemand.crop} currently has low demand.`
      : `Continue selling ${bestToSell.crop} — it has the strongest demand right now.`;

    return {
      overallStatus, bestToSell, recommendation,
    };
  }, [data, hasMeaningfulData]);

  return (
    <div className="supply-demand-panel min-w-0 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-6">
      <h3 className="text-[18px] font-bold text-[var(--text)]">Supply vs. Demand</h3>
      <p className="mt-1 text-[13px] text-[var(--muted)]">Compare customer demand with available supply.</p>

      {hasMeaningfulData ? (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-4 text-[12px] font-medium text-[var(--muted)]">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[var(--blue-700)]" /> Customer Orders</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[var(--green-600)]" /> Available Supply</span>
          </div>

          <div className="supply-demand-plot mt-3" style={{ height: compact ? Math.max(CHART_HEIGHT, data.length * 68 + 36) : CHART_HEIGHT }}>
            <ResponsiveContainer width="100%" height="100%" minWidth={0} onResize={(width) => setChartWidth(width)}>
              <BarChart data={data} layout={compact ? 'vertical' : 'horizontal'} margin={compact ? { top: 8, right: 32, left: 0, bottom: 0 } : { top: 24, right: 16, left: 0, bottom: 0 }} barGap={4} barCategoryGap="24%">
                <CartesianGrid vertical={compact} horizontal={!compact} stroke="var(--line)" strokeDasharray="3 3" />
                <XAxis type={compact ? 'number' : 'category'} dataKey={compact ? undefined : 'crop'} tick={{ fontSize: 12, fill: 'var(--muted)' }} axisLine={false} tickLine={false} interval={compact ? 'preserveStartEnd' : 0} height={36} allowDecimals={false} minTickGap={24} />
                <YAxis type={compact ? 'category' : 'number'} dataKey={compact ? 'crop' : undefined} tick={compact ? <CropTick /> : { fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} width={compact ? 104 : 28} interval={0} allowDecimals={false} />
                <Tooltip cursor={{ fill: 'transparent' }} content={<ChartTooltip />} />
                <Bar
                  dataKey="demand"
                  name="Demand"
                  fill="var(--blue-700)"
                  radius={compact ? [0, 3, 3, 0] : [3, 3, 0, 0]}
                  maxBarSize={36}
                  animationDuration={700}
                  animationEasing="ease-out"
                  background={<AlternatingBackground />}
                >
                  <LabelList dataKey="demand" position={compact ? 'right' : 'top'} style={{ fontSize: 12, fontWeight: 600, fill: 'var(--blue-700)' }} />
                </Bar>
                <Bar
                  dataKey="supply"
                  name="Supply"
                  fill="var(--green-600)"
                  radius={compact ? [0, 3, 3, 0] : [3, 3, 0, 0]}
                  maxBarSize={36}
                  animationDuration={700}
                  animationEasing="ease-out"
                  background={<AlternatingBackground />}
                >
                  <LabelList dataKey="supply" position={compact ? 'right' : 'top'} style={{ fontSize: 12, fontWeight: 600, fill: 'var(--green-700)' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="supply-demand-summary mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <SummaryCard icon={Sprout} label="Best Crop to Sell">
              <p className="mt-0.5 truncate text-[15px] font-bold text-[var(--green-700)]">{summary.bestToSell.crop}</p>
            </SummaryCard>
            <SummaryCard icon={LineChart} label="Market Status">
              <p className={`mt-0.5 truncate text-[15px] font-bold ${STATUS_STYLE[summary.overallStatus]}`}>{summary.overallStatus}</p>
            </SummaryCard>
            <SummaryCard icon={Bot} label="AI Recommendation">
              <p className="mt-0.5 text-[12px] leading-snug text-[var(--text-secondary)]">{summary.recommendation}</p>
            </SummaryCard>
          </div>
        </>
      ) : (
        <div className="mt-4 flex flex-col items-center justify-center gap-2 py-10 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--soft)] text-[var(--text-faint)]">
            <LineChart size={22} strokeWidth={1.5} />
          </span>
          <p className="max-w-xs text-[14px] font-semibold text-[var(--text-secondary)]">
            Not enough market activity to compare supply and demand.
          </p>
        </div>
      )}
    </div>
  );
}
