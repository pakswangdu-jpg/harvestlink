import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import TrendIndicator from './TrendIndicator';
import { cropActionRecommendation, formatCurrency } from '../../utils/formatters';

const inputClass = 'h-11 w-full min-w-0 rounded-lg border border-[var(--line)] bg-[var(--input-bg)] px-3 text-[14px] font-medium text-[var(--text-secondary)] outline-none transition-colors duration-200 focus:border-[var(--green-600)]';

const SORT_OPTIONS = [
  { value: 'demand_desc', label: 'Highest demand' },
  { value: 'change_desc', label: 'Highest expected price increase' },
  { value: 'change_asc', label: 'Lowest expected price increase' },
  { value: 'crop_asc', label: 'Crop name (A–Z)' },
];

const ACTION_STYLE = {
  Sell: 'bg-[var(--blue-100)] text-[var(--blue-700)]',
  Hold: 'bg-[var(--amber-100)] text-[var(--amber-700)]',
  Plant: 'bg-[var(--green-100)] text-[var(--green-800)]',
  Harvest: 'bg-[var(--violet-100)] text-[var(--violet-700)]',
};

const ACTION_LABEL = {
  Sell: 'Good selling opportunity',
  Hold: 'Wait and monitor',
  Plant: 'Consider planting',
  Harvest: 'Harvest soon',
};

const DEMAND_LABEL = {
  opportunity: 'High',
  steady: 'Moderate',
  none: 'Low',
};

const DEMAND_FILTER_OPTIONS = [
  { value: '', label: 'All demand levels' },
  { value: 'opportunity', label: 'High demand' },
  { value: 'steady', label: 'Moderate demand' },
  { value: 'none', label: 'Low demand' },
];

function sortCrops(list, sortBy) {
  const sorted = [...list];
  switch (sortBy) {
    case 'change_asc':
      return sorted.sort((a, b) => (a.expectedChangePercent ?? Infinity) - (b.expectedChangePercent ?? Infinity));
    case 'demand_desc':
      return sorted.sort((a, b) => (b.quantityOrdered || 0) - (a.quantityOrdered || 0));
    case 'price_desc':
      return sorted.sort((a, b) => (b.forecastPrice || 0) - (a.forecastPrice || 0));
    case 'crop_asc':
      return sorted.sort((a, b) => a.crop.localeCompare(b.crop));
    case 'change_desc':
    default:
      return sorted.sort((a, b) => (b.expectedChangePercent ?? -Infinity) - (a.expectedChangePercent ?? -Infinity));
  }
}

function priceChangeCell(value) {
  if (value == null) return <span className="text-[var(--muted)]">Not available</span>;
  const arrow = value > 0 ? '↑' : value < 0 ? '↓' : '→';
  const sign = value > 0 ? '+' : '';
  const tone = value > 0 ? 'text-[var(--green-700)]' : value < 0 ? 'text-[var(--red-700)]' : 'text-[var(--text-secondary)]';
  return <span className={`inline-flex items-center gap-1 ${tone}`}><span aria-hidden="true">{arrow}</span>{sign}{value}%</span>;
}

function recommendationLabel(entry) {
  if (entry.signal === 'opportunity' && entry.harvestSeason === 'Active') return 'Good selling opportunity';
  if (entry.signal === 'opportunity') return 'Consider planting';
  if (entry.signal === 'none' && entry.marketTrend === 'decreasing') return 'Price expected to soften';
  if (entry.signal === 'none') return 'Monitor demand';
  if (entry.harvestSeason === 'Active') return 'Harvest soon';
  if (entry.marketTrend === 'increasing') return 'Wait and monitor';
  return 'Monitor demand';
}

function PriceReference({ entry }) {
  return entry.referencePrice != null ? (
    <>
      {entry.priceBasis !== 'listing' ? <span className="text-[var(--muted)]">~</span> : null}
      {formatCurrency(entry.referencePrice)}{entry.unit ? `/${entry.unit}` : ''}
    </>
  ) : <span className="text-[var(--muted)]">Not available</span>;
}

function Recommendation({ entry }) {
  const action = cropActionRecommendation(entry);
  const label = recommendationLabel(entry);
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-[12px] font-semibold ${ACTION_STYLE[action]}`}>
      {label || ACTION_LABEL[action]}
    </span>
  );
}

function CropDetailsButton({ entry, selected, onSelectCrop }) {
  return (
    <button
      type="button"
      onClick={() => onSelectCrop(entry.crop)}
      aria-pressed={selected}
      style={{
        background: 'transparent',
        border: 0,
        borderRadius: 0,
        boxShadow: 'none',
        padding: 0,
        fontFamily: 'inherit',
        fontSize: '15px',
        fontWeight: 600,
        lineHeight: 1.5,
      }}
      className={`min-h-11 text-left underline-offset-2 hover:underline focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--green-600)] ${
        selected ? 'text-[var(--text)]' : 'text-[var(--green-700)]'
      }`}
    >
      {entry.crop}
      {selected ? <span className="sr-only">, selected</span> : null}
    </button>
  );
}

function CropCard({ entry, selected, onSelectCrop }) {
  return (
    <article className={`rounded-lg border p-4 ${
      selected ? 'border-[var(--green-600)] bg-[var(--green-50)]/50' : 'border-[var(--line)] bg-[var(--panel)]'
    }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <CropDetailsButton entry={entry} selected={selected} onSelectCrop={onSelectCrop} />
          <p className="mt-1 text-[14px] leading-relaxed text-[var(--text-secondary)]">{entry.currentDemand || DEMAND_LABEL[entry.signal] || 'Demand unavailable'}</p>
        </div>
        <Recommendation entry={entry} />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-[var(--line)] pt-3">
        <div>
          <dt className="text-[14px] text-[var(--text-secondary)]">Current reference</dt>
          <dd className="mt-0.5 text-[15px] text-[var(--text-secondary)]"><PriceReference entry={entry} /></dd>
        </div>
        <div>
          <dt className="text-[14px] text-[var(--text-secondary)]">Forecast reference</dt>
          <dd className="mt-0.5 text-[15px] font-semibold text-[var(--text)]">
            {entry.forecastPrice != null ? `${formatCurrency(entry.forecastPrice)}${entry.unit ? `/${entry.unit}` : ''}` : 'Not available'}
          </dd>
        </div>
        <div>
          <dt className="text-[14px] text-[var(--text-secondary)]">Change</dt>
          <dd className="mt-0.5 text-[15px] font-semibold">{priceChangeCell(entry.expectedChangePercent)}</dd>
        </div>
        <div>
          <dt className="text-[14px] text-[var(--text-secondary)]">Demand</dt>
          <dd className="mt-0.5 text-[15px] font-medium text-[var(--text)]">{entry.currentDemand || DEMAND_LABEL[entry.signal] || 'Not available'}</dd>
          <dt className="text-[14px] text-[var(--text-secondary)]">Market trend</dt>
          <dd className="mt-1"><TrendIndicator trend={entry.marketTrend} /></dd>
        </div>
      </dl>
    </article>
  );
}

export default function ForecastTable({
  crops, selectedCrop, onSelectCrop, category, onCategoryChange, categoryOptions, demandLevel, onDemandLevelChange,
}) {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('change_desc');

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = query ? crops.filter((entry) => entry.crop.toLowerCase().includes(query)) : crops;
    return sortCrops(filtered, sortBy);
  }, [crops, search, sortBy]);

  return (
    <section id="forecast-comparison" className="min-w-0 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4 sm:p-6" aria-labelledby="forecast-table-title">
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-[14px] font-semibold text-[var(--green-700)]">Crop comparison</p>
          <h2 id="forecast-table-title" className="mt-1 text-[21px] font-semibold text-[var(--text)]">Forecast by crop</h2>
          <p className="mt-1 text-[15px] leading-relaxed text-[var(--text-secondary)]">Choose a crop to see its forecast, data factors, and recommended action.</p>
          <p className="mt-1 text-[14px] leading-relaxed text-[var(--text-secondary)]">Prices are per listed unit. A “~” marks a historical or last-listed reference price.</p>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <label className={`flex w-full items-center gap-2 ${inputClass}`} htmlFor="forecast-table-search">
            <Search size={16} aria-hidden="true" className="shrink-0 text-[var(--muted)]" />
            <input
              id="forecast-table-search"
              className="w-full border-0 bg-transparent p-0 text-[15px] font-medium text-[var(--text)] outline-none"
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
            {DEMAND_FILTER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <select className={inputClass} value={sortBy} onChange={(event) => setSortBy(event.target.value)} aria-label="Sort crop forecasts">
            {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="mt-5 rounded-lg bg-[var(--soft)] px-4 py-8 text-center text-[14px] text-[var(--muted)]">
          No crops match these filters.
        </p>
      ) : (
        <>
          <div className="mt-5 hidden max-h-[520px] min-w-0 overflow-auto rounded-lg border border-[var(--line)] md:block">
            <table className="w-full min-w-[900px] border-separate border-spacing-0 text-left">
              <caption className="sr-only">Crop price, demand, trend, and recommendation forecasts</caption>
              <thead className="sticky top-0 z-10 bg-[var(--soft)]">
                <tr>
                  {['Crop', 'Current reference', 'Forecast reference', 'Expected change', 'Demand', 'Market trend', 'Recommendation'].map((label) => (
                    <th key={label} scope="col" className="whitespace-nowrap px-4 py-3 text-[14px] font-semibold text-[var(--text)]">{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((entry) => {
                  const selected = entry.crop === selectedCrop;
                  return (
                    <tr key={entry.crop} className={`border-t border-[var(--line)] ${selected ? 'bg-[var(--green-50)]/50' : ''}`}>
                      <td className="whitespace-nowrap border-t border-[var(--line)] px-4 py-2 text-[15px] text-[var(--text)]">
                        <CropDetailsButton entry={entry} selected={selected} onSelectCrop={onSelectCrop} />
                      </td>
                      <td className="whitespace-nowrap border-t border-[var(--line)] px-4 py-3 text-[15px] text-[var(--text)]"><PriceReference entry={entry} /></td>
                      <td className="whitespace-nowrap border-t border-[var(--line)] px-4 py-3 text-[15px] font-medium text-[var(--text)]">
                        {entry.forecastPrice != null ? `${formatCurrency(entry.forecastPrice)}${entry.unit ? `/${entry.unit}` : ''}` : <span className="text-[var(--muted)]">Not available</span>}
                      </td>
                      <td className="whitespace-nowrap border-t border-[var(--line)] px-4 py-3 text-[15px] font-semibold">{priceChangeCell(entry.expectedChangePercent)}</td>
                      <td className="whitespace-nowrap border-t border-[var(--line)] px-4 py-3 text-[15px] text-[var(--text)]">{entry.currentDemand || DEMAND_LABEL[entry.signal] || 'Not available'}</td>
                      <td className="whitespace-nowrap border-t border-[var(--line)] px-4 py-3"><TrendIndicator trend={entry.marketTrend} /></td>
                      <td className="whitespace-nowrap border-t border-[var(--line)] px-4 py-3"><Recommendation entry={entry} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex flex-col gap-3 md:hidden">
            {rows.map((entry) => (
              <CropCard
                key={entry.crop}
                entry={entry}
                selected={entry.crop === selectedCrop}
                onSelectCrop={onSelectCrop}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
