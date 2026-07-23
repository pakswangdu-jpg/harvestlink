import { useMemo } from 'react';
import {
  Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { motion } from 'framer-motion';
import { Bot, LineChart, Sprout } from 'lucide-react';

const CHART_HEIGHT = 260;

const STATUS_STYLE = {
  'High Demand': 'text-green-700',
  'Low Demand': 'text-red-700',
  Balanced: 'text-amber-700',
};

// A crop's own demand (real order count) vs. its own supply (real active-listing count) —
// both counts, same unit, so "higher bar" always means "more" in a way that's directly
// comparable. Same calculation as before this redesign — only the presentation changed.
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
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-lg">
      <p className="text-[13px] font-semibold text-gray-900">{entry.crop}</p>
      <div className="mt-2 flex flex-col gap-1 text-[13px]">
        <p className="text-blue-700">Demand: <span className="font-semibold">{entry.demand} Order{entry.demand === 1 ? '' : 's'}</span></p>
        <p className="text-green-700">Supply: <span className="font-semibold">{entry.supply} Listing{entry.supply === 1 ? '' : 's'}</span></p>
        <p className={`font-semibold ${difference >= 0 ? 'text-green-700' : 'text-red-700'}`}>
          Difference: {difference > 0 ? '+' : ''}{difference}
        </p>
        <p className={`font-semibold ${STATUS_STYLE[status]}`}>Market Status: {status}</p>
        <p className="mt-1 text-[12px] leading-relaxed text-gray-500">{computeTooltipRecommendation(status)}</p>
      </div>
    </div>
  );
}

// Alternating light backdrop behind every other crop's bar group — same visual aid as the
// reference chart's zebra striping, just driven by the real category index Recharts already
// passes to a custom `background` renderer, not a hand-placed overlay.
function AlternatingBackground({ x, y, width, height, index }) {
  if (index % 2 !== 0) return null;
  return <rect x={x} y={y} width={width} height={height} fill="#F8FAFC" rx={6} />;
}

function SummaryCard({ icon: Icon, label, children }) {
  return (
    <motion.div
      whileHover={{ y: -1 }}
      transition={{ duration: 0.2 }}
      className="rounded-lg border border-gray-200 bg-white p-2.5 shadow-sm transition-shadow duration-200 hover:shadow-md"
    >
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
        <Icon size={11} /> {label}
      </p>
      {children}
    </motion.div>
  );
}

// Grouped bars, real orderCount vs. real activeListings per crop (see
// backend/src/controllers/forecast.controller.js and FarmerDemandForecast.jsx's
// supplyDemandData) — no calculation changed here, only a leaner presentation: fewer
// summary cards, no axis-label clutter, one plain-language recommendation instead of four
// separate stat cards.
export default function SupplyDemandBarChart({ data }) {
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
    <div className="min-w-0 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="text-[18px] font-bold text-gray-900">Supply vs. Demand</h3>
      <p className="mt-1 text-[13px] text-gray-500">Compare customer demand with available supply.</p>

      {hasMeaningfulData ? (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-4 text-[12px] font-medium text-gray-500">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-blue-600" /> Customer Orders</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-green-600" /> Available Supply</span>
          </div>

          <div className="mt-3" style={{ height: CHART_HEIGHT }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 24, right: 8, left: 0, bottom: 0 }} barGap={4} barCategoryGap="24%">
                <CartesianGrid vertical={false} stroke="#F1F5F9" strokeDasharray="3 3" />
                <XAxis dataKey="crop" tick={{ fontSize: 12, fill: '#6B7280' }} axisLine={false} tickLine={false} interval={0} height={36} />
                <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} width={28} allowDecimals={false} />
                <Tooltip cursor={{ fill: 'transparent' }} content={<ChartTooltip />} />
                <Bar
                  dataKey="demand"
                  name="Demand"
                  fill="#3B82F6"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={36}
                  animationDuration={700}
                  animationEasing="ease-out"
                  background={<AlternatingBackground />}
                >
                  <LabelList dataKey="demand" position="top" style={{ fontSize: 12, fontWeight: 700, fill: '#1D4ED8' }} />
                </Bar>
                <Bar
                  dataKey="supply"
                  name="Supply"
                  fill="#16A34A"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={36}
                  animationDuration={700}
                  animationEasing="ease-out"
                  background={<AlternatingBackground />}
                >
                  <LabelList dataKey="supply" position="top" style={{ fontSize: 12, fontWeight: 700, fill: '#15803D' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <SummaryCard icon={Sprout} label="Best Crop to Sell">
              <p className="mt-0.5 truncate text-[15px] font-bold text-green-700">{summary.bestToSell.crop}</p>
            </SummaryCard>
            <SummaryCard icon={LineChart} label="Market Status">
              <p className={`mt-0.5 truncate text-[15px] font-bold ${STATUS_STYLE[summary.overallStatus]}`}>{summary.overallStatus}</p>
            </SummaryCard>
            <SummaryCard icon={Bot} label="AI Recommendation">
              <p className="mt-0.5 text-[12px] leading-snug text-gray-700">{summary.recommendation}</p>
            </SummaryCard>
          </div>
        </>
      ) : (
        <div className="mt-4 flex flex-col items-center justify-center gap-2 py-10 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-50 text-gray-300">
            <LineChart size={22} strokeWidth={1.5} />
          </span>
          <p className="max-w-xs text-[14px] font-semibold text-gray-600">
            Not enough market activity to compare supply and demand.
          </p>
        </div>
      )}
    </div>
  );
}
