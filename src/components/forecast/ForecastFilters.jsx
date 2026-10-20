import { motion } from 'framer-motion';
import { CalendarDays, MapPin, RefreshCw } from 'lucide-react';
import { CEBU_MUNICIPALITIES } from '../../utils/constants';

const selectClass = 'h-11 rounded-lg border border-[var(--line)] bg-[var(--input-bg)] pl-9 pr-3 text-[14px] font-medium text-[var(--text-secondary)] outline-none transition-colors duration-200 focus:border-[var(--green-600)] appearance-none';





export default function ForecastFilters({
  municipality, onMunicipalityChange, period, periods, onPeriodChange,
  customDate, onCustomDateChange, onRefresh, isRefreshing,
}) {
  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex flex-wrap items-center gap-2.5 sm:justify-end">
      <span className="relative w-full sm:w-auto">
        <MapPin size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
        <select
          className={`${selectClass} w-full sm:w-auto`}
          value={municipality}
          onChange={(event) => onMunicipalityChange(event.target.value)}
          aria-label="Filter by municipality"
        >
          <option value="">All municipalities</option>
          {CEBU_MUNICIPALITIES.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </span>

      {periods.length ? (
        <span className="relative w-full sm:w-auto">
          <CalendarDays size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
          <select
            className={`${selectClass} w-full sm:w-auto`}
            value={period}
            onChange={(event) => onPeriodChange(event.target.value)}
            aria-label="Forecast period"
          >
            {periods.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </span>
      ) : null}

      {period === 'custom' ? (
        <input
          type="date"
          value={customDate}
          min={todayIso}
          onChange={(event) => onCustomDateChange(event.target.value)}
          aria-label="Custom forecast date"
          className="h-11 w-full rounded-lg border border-[var(--line)] bg-[var(--input-bg)] px-3 text-[14px] font-medium text-[var(--text-secondary)] outline-none transition-colors duration-200 focus:border-[var(--green-600)] sm:w-auto"
        />
      ) : null}

      <motion.button
        type="button"
        onClick={onRefresh}
        whileTap={{ scale: 0.96 }}
        disabled={isRefreshing}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[var(--green-700)] px-4 text-[14px] font-semibold text-white transition-colors duration-150 hover:bg-[var(--green-800)] disabled:opacity-60 sm:w-auto"
      >
        <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
        Refresh
      </motion.button>
    </div>
  );
}
