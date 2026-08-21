import { motion } from 'framer-motion';
import { CalendarDays, MapPin, RefreshCw } from 'lucide-react';
import { CEBU_MUNICIPALITIES } from '../../utils/constants';

const selectClass = 'h-10 rounded-lg border border-[var(--line)] bg-[var(--input-bg)] pl-9 pr-3 text-[14px] font-medium text-[var(--text-secondary)] outline-none transition-colors duration-200 focus:border-[var(--green-600)] appearance-none';

// Replaces the old ForecastHeader — same municipality/refresh controls, plus the fuller
// period list (Today through Custom Date) and a date input that appears once "Custom Date"
// is selected. Changing any control here re-triggers both getDemandForecast and
// getCropForecastDetail in FarmerDemandForecast.jsx — there's no separate "apply" step.
export default function ForecastFilters({
  municipality, onMunicipalityChange, period, periods, onPeriodChange,
  customDate, onCustomDateChange, onRefresh, isRefreshing,
}) {
  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex flex-wrap items-center justify-end gap-2.5">
      <span className="relative">
        <MapPin size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
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
          <CalendarDays size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
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

      {period === 'custom' ? (
        <input
          type="date"
          value={customDate}
          min={todayIso}
          onChange={(event) => onCustomDateChange(event.target.value)}
          aria-label="Custom forecast date"
          className="h-10 rounded-lg border border-[var(--line)] bg-[var(--input-bg)] px-3 text-[14px] font-medium text-[var(--text-secondary)] outline-none transition-colors duration-200 focus:border-[var(--green-600)]"
        />
      ) : null}

      <motion.button
        type="button"
        onClick={onRefresh}
        whileTap={{ scale: 0.96 }}
        disabled={isRefreshing}
        className="flex h-9 items-center gap-2 rounded-md bg-[var(--green-700)] px-4 text-[14px] font-semibold text-white transition-colors duration-150 hover:bg-[var(--green-800)] disabled:opacity-60"
      >
        <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
        Refresh
      </motion.button>
    </div>
  );
}
