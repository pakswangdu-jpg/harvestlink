const DEFAULT_ITEMS = [
  { key: 'historical', label: 'Historical', swatchClass: 'bg-[var(--green-600)]' },
  { key: 'forecast', label: 'Forecast', swatchClass: 'bg-[var(--blue-700)]' },
  { key: 'today', label: 'Today', swatchClass: 'bg-[var(--amber-700)]' },
  { key: 'confidence', label: 'Confidence Band', swatchClass: 'bg-[var(--green-100)]' },
];




export default function ForecastLegend({ showForecast = true }) {
  const items = showForecast ? DEFAULT_ITEMS : DEFAULT_ITEMS.filter((item) => item.key === 'historical');
  return (
    <div className="flex flex-wrap items-center gap-4 text-[12px] font-medium text-[var(--muted)]">
      {items.map((item) => (
        <span key={item.key} className="flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-full ${item.swatchClass}`} />
          {item.label}
        </span>
      ))}
    </div>
  );
}
