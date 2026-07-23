import { motion } from 'framer-motion';
import { CalendarDays, MapPin, RefreshCw } from 'lucide-react';
import { CEBU_MUNICIPALITIES } from '../../utils/constants';

const selectClass = 'h-10 rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-[14px] font-medium text-gray-700 outline-none transition-colors duration-200 focus:border-green-600 appearance-none';

// The page header — title/subtitle plus the three controls that drive every other section:
// refresh, location, and forecast period. All three are thin wrappers around state the page
// already owns; this component has no data logic of its own.
export default function ForecastHeader({
  municipality, onMunicipalityChange, period, periods, onPeriodChange, onRefresh, isRefreshing,
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-[12px] font-semibold uppercase tracking-widest text-green-700">Cebu Farm-to-Market</p>
        <h1 className="mt-1 text-[32px] font-bold leading-tight text-gray-900">Demand Forecast</h1>
        <p className="mt-1.5 max-w-xl text-[15px] text-gray-500">
          AI-powered forecast to help farmers decide what to plant, harvest, and sell.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <span className="relative">
          <MapPin size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <select
            className={selectClass}
            value={municipality}
            onChange={(event) => onMunicipalityChange(event.target.value)}
            aria-label="Filter by municipality"
          >
            <option value="">All municipalities</option>
            {CEBU_MUNICIPALITIES.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </span>

        {periods.length ? (
          <span className="relative">
            <CalendarDays size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <select
              className={selectClass}
              value={period}
              onChange={(event) => onPeriodChange(event.target.value)}
              aria-label="Forecast period"
            >
              {periods.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </span>
        ) : null}

        <motion.button
          type="button"
          onClick={onRefresh}
          whileTap={{ scale: 0.96 }}
          disabled={isRefreshing}
          className="flex h-10 items-center gap-2 rounded-lg bg-green-700 px-4 text-[14px] font-semibold text-white shadow-sm transition-colors duration-200 hover:bg-green-800 disabled:opacity-60"
        >
          <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
          Refresh
        </motion.button>
      </div>
    </div>
  );
}
