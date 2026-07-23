import { useMemo } from 'react';
import {
  CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

const CHART_HEIGHT = 320;

function formatVolume(value) {
  if (value == null) return '—';
  return Number(value).toLocaleString('en-PH', { maximumFractionDigits: 1 });
}

function ChartTooltip({ active, payload, label, unit }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3.5 py-2.5 shadow-md">
      <p className="text-[12px] font-semibold text-gray-900">{label}</p>
      {payload.map((entry) => (
        <p key={entry.dataKey} className="text-[13px]" style={{ color: entry.color }}>
          {entry.name}: {formatVolume(entry.value)} {unit}/day
        </p>
      ))}
    </div>
  );
}

// Same merge-onto-one-date-axis approach as PriceForecastChart.jsx, applied to order VOLUME
// instead of price: `historicalChart` is real recorded order quantity per day, `forecastCurve`
// is the demand trend engine's real projected daily rate (see priceForecastEngine.js's
// projectDemand). Historical stays solid, forecast stays dashed — never blended into one line.
export default function DemandForecastChart({ historicalChart, forecastCurve, todayIso, unit = 'unit' }) {
  const data = useMemo(() => {
    const byDate = new Map();

    historicalChart.forEach((point) => {
      byDate.set(point.date, { date: point.date, historicalVolume: point.volume });
    });

    forecastCurve.forEach((point) => {
      const existing = byDate.get(point.date) || { date: point.date };
      existing.forecastVolume = point.volume;
      byDate.set(point.date, existing);
    });

    return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  }, [historicalChart, forecastCurve]);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <p className="text-[12px] font-semibold uppercase tracking-widest text-green-700">Demand Trend</p>
      <h3 className="mt-1 text-[20px] font-bold text-gray-900">Forecasted Demand Trend</h3>
      <div className="mt-5" style={{ height: CHART_HEIGHT }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#F3F4F6" />
            <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#6B7280' }} axisLine={{ stroke: '#E5E7EB' }} tickLine={false} />
            <YAxis tick={{ fontSize: 12, fill: '#6B7280' }} axisLine={false} tickLine={false} width={48} tickFormatter={formatVolume} />
            <Tooltip content={<ChartTooltip unit={unit} />} />
            <ReferenceLine x={todayIso} stroke="#9CA3AF" strokeDasharray="4 4" label={{ value: 'Today', position: 'insideTopRight', fontSize: 11, fill: '#6B7280' }} />
            <Line type="monotone" dataKey="historicalVolume" name="Historical" stroke="#16A34A" strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
            <Line type="monotone" dataKey="forecastVolume" name="Forecast" stroke="#3B82F6" strokeWidth={2.5} strokeDasharray="6 4" dot={{ r: 3 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
