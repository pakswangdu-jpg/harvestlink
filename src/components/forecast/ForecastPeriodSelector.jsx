// A segmented pill control for the 7 forecast periods — selecting one re-triggers the
// parent's fetch (see FarmerPriceForecast.jsx), refreshing every displayed field.
export default function ForecastPeriodSelector({ periods, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {periods.map((period) => (
        <button
          key={period.value}
          type="button"
          onClick={() => onChange(period.value)}
          className={`h-9 shrink-0 rounded-full border px-4 text-[13px] font-semibold transition-colors duration-200 ${
            value === period.value
              ? 'border-green-700 bg-green-700 text-white'
              : 'border-gray-200 bg-white text-gray-600 hover:border-green-600 hover:text-green-700'
          }`}
        >
          {period.label}
        </button>
      ))}
    </div>
  );
}
