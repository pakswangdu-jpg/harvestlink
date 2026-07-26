import { useEffect, useState } from 'react';
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import StatCard from '../../../components/admin/StatCard';
import Table from '../../../components/admin/Table';
import LoadingState from '../../../components/admin/LoadingState';
import { getOverrideHistory } from '../../../services/marketPriceService';
import { formatCurrency, formatDate } from '../../../utils/formatters';

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-md border border-[#D0D7DE] bg-white px-3 py-2 text-[12px] shadow-sm">
      <p className="font-medium text-[#24292F]">{label}</p>
      <p className="text-[#57606A]">
        {formatCurrency(point.price)}/kg {point.isOverride ? '(admin override)' : '(PSA)'}
      </p>
    </div>
  );
}

function HistoryChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-md border border-[#D0D7DE] bg-white px-3 py-2 text-[12px] shadow-sm">
      <p className="font-medium text-[#24292F]">{label}</p>
      <p className="text-[#57606A]">
        {point.price == null ? 'Reset to PSA' : `${formatCurrency(point.price)}/kg`}
      </p>
    </div>
  );
}

// The audit-log table below already covers the full detail (who, why, exact previous/new
// price) — this just gives the same history an at-a-glance shape, same idea as the PSA
// trend chart above it. Distinct blue (matches the "Overridden" status badge elsewhere on
// this page) rather than the trend chart's green, so the two are never visually confused.
function PriceHistoryChart({ history }) {
  if (!history.length) return null;
  const points = [...history].reverse().map((entry) => ({
    date: formatDate(entry.createdAt),
    price: entry.newPrice,
  }));
  return (
    <div style={{ height: 140 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#EAEEF2" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#57606A' }} axisLine={{ stroke: '#D0D7DE' }} tickLine={false} />
          <YAxis
            tick={{ fontSize: 11, fill: '#57606A' }}
            axisLine={false}
            tickLine={false}
            width={56}
            tickFormatter={(value) => formatCurrency(value)}
            domain={['auto', 'auto']}
          />
          <Tooltip content={<HistoryChartTooltip />} cursor={{ stroke: '#D0D7DE' }} />
          <Line
            type="stepAfter"
            dataKey="price"
            stroke="#0969DA"
            strokeWidth={1.75}
            dot={{ r: 3, fill: '#0969DA', strokeWidth: 0 }}
            activeDot={{ r: 5 }}
            connectNulls
            isAnimationActive
            animationDuration={300}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function PriceTrendChart({ points }) {
  const plotted = points.filter((point) => point.price != null);
  if (plotted.length < 2) {
    return <p className="py-6 text-center text-[13px] text-[#57606A]">Not enough PSA history yet to chart a trend.</p>;
  }
  return (
    <div style={{ height: 160 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#EAEEF2" />
          <XAxis dataKey="year" tick={{ fontSize: 11, fill: '#57606A' }} axisLine={{ stroke: '#D0D7DE' }} tickLine={false} />
          <YAxis
            tick={{ fontSize: 11, fill: '#57606A' }}
            axisLine={false}
            tickLine={false}
            width={56}
            tickFormatter={(value) => formatCurrency(value)}
            domain={['auto', 'auto']}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: '#D0D7DE' }} />
          <Line
            type="monotone"
            dataKey="price"
            stroke="#166534"
            strokeWidth={1.75}
            dot={{ r: 2.5, fill: '#166534', strokeWidth: 0 }}
            activeDot={{ r: 4 }}
            connectNulls
            isAnimationActive
            animationDuration={300}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// Mounted only while its row is expanded (see AdminPriceMonitoring.jsx) — fetches this one
// commodity's override history on demand rather than every row prefetching history nobody
// looks at.
export default function CommodityDetailPanel({ row }) {
  const [history, setHistory] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getOverrideHistory(row.id).then((data) => { if (!cancelled) setHistory(data); }).catch(() => { if (!cancelled) setHistory([]); });
    return () => { cancelled = true; };
  }, [row.id]);

  return (
    <div className="space-y-4 bg-[#F6F8FA] px-5 py-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="PSA Reference" value={row.referencePrice == null ? '—' : `${formatCurrency(row.referencePrice)}/kg`} />
        <StatCard label="Avg Farmer Price" value={row.avgFarmerPrice == null ? '—' : `${formatCurrency(row.avgFarmerPrice)}/kg`} />
        <StatCard label="Highest Price" value={row.highFarmerPrice == null ? '—' : `${formatCurrency(row.highFarmerPrice)}/kg`} />
        <StatCard label="Lowest Price" value={row.lowFarmerPrice == null ? '—' : `${formatCurrency(row.lowFarmerPrice)}/kg`} />
      </div>

      <div className="rounded-lg border border-[#D0D7DE] bg-white p-4">
        <p className="mb-2 text-[13px] font-semibold text-[#24292F]">Price trend (last 5 years)</p>
        <PriceTrendChart points={row.trendPoints} />
      </div>

      <div className="rounded-lg border border-[#D0D7DE] bg-white p-4">
        <p className="mb-2 text-[13px] font-semibold text-[#24292F]">Price history</p>
        {history === null ? (
          <LoadingState rows={2} />
        ) : (
          <>
            <PriceHistoryChart history={history} />
            <Table
              columns={[
                { key: 'createdAt', label: 'Date', render: (entry) => formatDate(entry.createdAt) },
                { key: 'previousPrice', label: 'Previous Price', render: (entry) => (entry.previousPrice == null ? '—' : `${formatCurrency(entry.previousPrice)}/kg`) },
                { key: 'newPrice', label: 'New Price', render: (entry) => (entry.newPrice == null ? 'Reset to PSA' : `${formatCurrency(entry.newPrice)}/kg`) },
                { key: 'updatedByName', label: 'Updated By', render: (entry) => entry.updatedByName || '—' },
                { key: 'reason', label: 'Reason', render: (entry) => <span className="whitespace-normal">{entry.reason || '—'}</span> },
              ]}
              rows={history}
              emptyMessage="No override changes recorded for this commodity yet."
            />
          </>
        )}
      </div>
    </div>
  );
}
