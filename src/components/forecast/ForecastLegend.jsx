const DEFAULT_ITEMS = [
  { key: 'historical', label: 'Historical', swatchClass: 'bg-green-600' },
  { key: 'forecast', label: 'Forecast', swatchClass: 'bg-blue-600' },
  { key: 'today', label: 'Today', swatchClass: 'bg-amber-500' },
  { key: 'confidence', label: 'Confidence Band', swatchClass: 'bg-green-200' },
];

// Small color-key row shared by ForecastChart and DemandChart — kept as its own component
// since both charts render an identical legend and the historical-only "Historical" tab view
// needs to drop the forecast/today/confidence entries.
export default function ForecastLegend({ showForecast = true }) {
  const items = showForecast ? DEFAULT_ITEMS : DEFAULT_ITEMS.filter((item) => item.key === 'historical');
  return (
    <div className="flex flex-wrap items-center gap-4 text-[12px] font-medium text-gray-500">
      {items.map((item) => (
        <span key={item.key} className="flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-full ${item.swatchClass}`} />
          {item.label}
        </span>
      ))}
    </div>
  );
}
