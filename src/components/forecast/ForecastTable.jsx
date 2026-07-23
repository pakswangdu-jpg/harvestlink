import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import TrendIndicator from './TrendIndicator';
import { cropActionRecommendation, formatCurrency } from '../../utils/formatters';

const inputClass = 'h-10 rounded-lg border border-gray-200 bg-white px-3 text-[14px] font-medium text-gray-700 outline-none transition-colors duration-200 focus:border-green-600';

const SORT_OPTIONS = [
  { value: 'profit_desc', label: 'Highest profit' },
  { value: 'price_desc', label: 'Highest forecast price' },
  { value: 'crop_asc', label: 'Crop name (A–Z)' },
];

const ACTION_STYLE = {
  Sell: 'bg-blue-100 text-blue-700',
  Hold: 'bg-amber-100 text-amber-700',
  Plant: 'bg-green-100 text-green-800',
  Harvest: 'bg-purple-100 text-purple-700',
};

const DEMAND_LEVEL_OPTIONS = [
  { value: '', label: 'All demand levels' },
  { value: 'opportunity', label: 'High opportunity' },
  { value: 'steady', label: 'Stable' },
  { value: 'none', label: 'Low demand' },
];

function sortCrops(list, sortBy) {
  const sorted = [...list];
  switch (sortBy) {
    case 'price_desc': return sorted.sort((a, b) => (b.forecastPrice || 0) - (a.forecastPrice || 0));
    case 'crop_asc': return sorted.sort((a, b) => a.crop.localeCompare(b.crop));
    case 'profit_desc':
    default:
      return sorted.sort((a, b) => (b.expectedProfit || 0) - (a.expectedProfit || 0));
  }
}

function priceChangeCell(value) {
  if (value == null) return '—';
  const sign = value > 0 ? '+' : '';
  return <span className={value >= 0 ? 'text-green-700' : 'text-red-700'}>{sign}{value}%</span>;
}

// The full comparison table — search/sort/filter added client-side over already-fetched
// `crops` (same pattern as ProductFilters.jsx + sortProducts() in FarmerProducts.jsx). No
// new requests: every row here is a crop object the page already has. Category/demand-level
// filters live here rather than the page header, keeping the header itself minimal without
// dropping either filter's functionality.
export default function ForecastTable({
  crops, selectedCrop, onSelectCrop, category, onCategoryChange, categoryOptions, demandLevel, onDemandLevelChange,
}) {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('profit_desc');

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = query ? crops.filter((entry) => entry.crop.toLowerCase().includes(query)) : crops;
    return sortCrops(filtered, sortBy);
  }, [crops, search, sortBy]);

  return (
    <div className="min-w-0 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-widest text-green-700">Comparison</p>
          <h3 className="mt-1 text-[18px] font-bold text-gray-900">Forecast by Crop</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <label className={`flex w-56 items-center gap-2 ${inputClass}`} htmlFor="forecast-table-search">
            <Search size={15} className="shrink-0 text-gray-400" />
            <input
              id="forecast-table-search"
              className="w-full border-0 bg-transparent p-0 text-[14px] font-medium text-gray-700 outline-none"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search crops"
            />
          </label>
          <select className={inputClass} value={category} onChange={(event) => onCategoryChange(event.target.value)} aria-label="Filter by category">
            <option value="">All categories</option>
            {categoryOptions.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select className={inputClass} value={demandLevel} onChange={(event) => onDemandLevelChange(event.target.value)} aria-label="Filter by demand level">
            {DEMAND_LEVEL_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <select className={inputClass} value={sortBy} onChange={(event) => setSortBy(event.target.value)} aria-label="Sort forecast table">
            {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
      </div>

      <div className="mt-5 max-h-[520px] overflow-auto rounded-xl border border-gray-100">
        <table className="w-full border-separate border-spacing-0 text-left">
          <thead className="sticky top-0 z-10 bg-gray-50">
            <tr>
              {['Crop', 'Current Price', 'Forecast Price', 'Price Change', 'Demand', 'Market Trend', 'Recommendation'].map((label) => (
                <th key={label} className="whitespace-nowrap px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-[14px] text-gray-500">No crops match this search.</td></tr>
            ) : rows.map((entry) => (
              <tr
                key={entry.crop}
                onClick={() => onSelectCrop(entry.crop)}
                className={`cursor-pointer transition-colors duration-150 hover:bg-green-50/60 ${entry.crop === selectedCrop ? 'bg-green-50' : ''}`}
              >
                <td className="whitespace-nowrap rounded-l-xl px-4 py-3.5 text-[14px] font-bold text-gray-900">{entry.crop}</td>
                <td className="whitespace-nowrap px-4 py-3.5 text-[14px] text-gray-700">{formatCurrency(entry.currentPrice)}</td>
                <td className="whitespace-nowrap px-4 py-3.5 text-[14px] font-semibold text-gray-900">{formatCurrency(entry.forecastPrice)}</td>
                <td className="whitespace-nowrap px-4 py-3.5 text-[14px] font-semibold">{priceChangeCell(entry.expectedChangePercent)}</td>
                <td className="whitespace-nowrap px-4 py-3.5 text-[14px] text-gray-700">{entry.currentDemand}</td>
                <td className="whitespace-nowrap px-4 py-3.5"><TrendIndicator trend={entry.marketTrend} /></td>
                <td className="whitespace-nowrap rounded-r-xl px-4 py-3.5">
                  <span className={`rounded-full px-2.5 py-1 text-[12px] font-bold ${ACTION_STYLE[cropActionRecommendation(entry)]}`}>
                    {cropActionRecommendation(entry)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
