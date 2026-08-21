import { formatCurrency } from '../../utils/formatters';

function formatLongDate(dateIso) {
  const parsed = new Date(dateIso);
  if (Number.isNaN(parsed.getTime())) return dateIso;
  return parsed.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function formatVolume(value) {
  if (value == null) return '—';
  return Number(value).toLocaleString('en-PH', { maximumFractionDigits: 2 });
}

// Shared tooltip content for both ForecastChart (price) and DemandChart (demand). `data` is
// the full merged historical+forecast series (see buildMergedSeries in each chart) so the
// hovered point's diff/percent-change can be computed against whichever real point actually
// came right before it, not an assumption. `mode` picks the value field/unit/formatter.
export default function ForecastTooltip({
  active, payload, data, mode = 'price', unit, todayIso,
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  const historicalKey = mode === 'price' ? 'historicalPrice' : 'historicalVolume';
  const forecastKey = mode === 'price' ? 'forecastPrice' : 'forecastVolume';
  const isHistorical = point[historicalKey] != null;
  const value = isHistorical ? point[historicalKey] : point[forecastKey];
  if (value == null) return null;
  const isToday = todayIso != null && point.date === todayIso;

  const index = data.findIndex((row) => row.date === point.date);
  const previousRow = index > 0 ? data[index - 1] : null;
  const previousValue = previousRow ? (previousRow[historicalKey] ?? previousRow[forecastKey]) : null;
  const diff = previousValue != null ? Math.round((value - previousValue) * 100) / 100 : null;
  const percent = previousValue ? Math.round(((value - previousValue) / previousValue) * 1000) / 10 : null;

  const formatValue = (raw) => (mode === 'price' ? `${formatCurrency(raw)}${unit ? `/${unit}` : ''}` : `${formatVolume(raw)} ${unit || 'unit'}/day`);

  return (
    <div className="min-w-[230px] rounded-xl border border-[var(--line)] bg-[var(--surface-elevated)] px-4 py-3 shadow-lg">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] font-semibold text-[var(--text)]">{formatLongDate(point.date)}</p>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
          isHistorical ? 'bg-[var(--green-100)] text-[var(--green-700)]' : 'bg-[var(--blue-100)] text-[var(--blue-700)]'
        }`}
        >
          {isToday ? 'Today' : isHistorical ? 'Historical' : 'Forecast'}
        </span>
      </div>

      <p className="mt-2 text-[18px] font-bold text-[var(--text)]">{formatValue(value)}</p>

      {diff != null ? (
        <p className={`mt-0.5 text-[12.5px] font-semibold ${diff >= 0 ? 'text-[var(--green-700)]' : 'text-[var(--red-700)]'}`}>
          {diff >= 0 ? '+' : ''}{mode === 'price' ? formatCurrency(diff) : formatVolume(diff)}
          {percent != null ? ` (${percent > 0 ? '+' : ''}${percent}%)` : ''} vs previous point
        </p>
      ) : null}

      {!isHistorical && point.confidence != null ? (
        <div className="mt-2 flex items-center gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Confidence</span>
          <span className="text-[12.5px] font-bold text-[var(--text-secondary)]">{point.confidence}%</span>
        </div>
      ) : null}

      {!isHistorical && point.upper != null && point.lower != null ? (
        <p className="mt-0.5 text-[11.5px] text-[var(--muted)]">
          Range: {mode === 'price' ? `${formatCurrency(point.lower)} – ${formatCurrency(point.upper)}` : `${formatVolume(point.lower)} – ${formatVolume(point.upper)}`}
        </p>
      ) : null}

      {point.reason ? (
        <p className="mt-2 border-t border-[var(--line)] pt-2 text-[12px] leading-snug text-[var(--text-secondary)]">
          <span className="font-semibold text-[var(--text-secondary)]">AI Reason: </span>{point.reason}
        </p>
      ) : null}

      {point.source === 'psa' ? (
        <p className="mt-2 text-[11px] text-[var(--muted)]">Source: PSA farmgate reference price</p>
      ) : null}
    </div>
  );
}
