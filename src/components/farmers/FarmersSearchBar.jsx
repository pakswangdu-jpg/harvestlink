import { useEffect, useRef, useState } from 'react';
import { ChevronDown, SlidersHorizontal, Search } from 'lucide-react';
import { CEBU_MUNICIPALITIES } from '../../utils/constants';

const SORT_OPTIONS = [
  { value: 'top-rated', label: 'Top Rated' },
  { value: 'most-orders', label: 'Most Orders' },
  { value: 'newest', label: 'Newest' },
  { value: 'name', label: 'Name (A–Z)' },
];

// The location/sort selects are native <select> elements (same convention as
// Marketplace.jsx's filter bar) — no custom listbox needed for two short, static lists.
function InlineSelect({ value, onChange, options, ariaLabel }) {
  return (
    <div className="relative shrink-0">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={ariaLabel}
        className="h-9 appearance-none rounded-lg border-0 bg-transparent pl-2.5 pr-6 text-[13px] font-medium text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--green-600)]/30"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      <ChevronDown size={13} className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
    </div>
  );
}

// Category multi-select popover behind the "Filter" button — click-outside-to-close follows
// the same pattern as NotificationBell.jsx's dropdown.
function FilterPopover({ categories, selected, onToggle, onClear }) {
  const wrapperRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div ref={wrapperRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        className={`flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold transition-colors ${
          selected.length ? 'bg-[var(--green-50)] text-[var(--green-800)]' : 'text-[var(--muted)] hover:bg-[var(--soft)]'
        }`}
      >
        <SlidersHorizontal size={14} />
        Filter{selected.length ? ` (${selected.length})` : ''}
      </button>

      {isOpen ? (
        <div className="absolute right-0 top-[calc(100%+8px)] z-20 w-56 rounded-xl border border-[var(--line)] bg-[var(--surface-elevated)] p-3 shadow-lg">
          <p className="px-1 pb-2 text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">Categories</p>
          {categories.length ? (
            <div className="max-h-48 space-y-0.5 overflow-y-auto">
              {categories.map((category) => (
                <label key={category} className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1.5 text-[13px] text-[var(--text-secondary)] hover:bg-[var(--soft)]">
                  <input
                    type="checkbox"
                    checked={selected.includes(category)}
                    onChange={() => onToggle(category)}
                    className="h-3.5 w-3.5 rounded border-[var(--line)] text-[var(--green-700)] focus:ring-[var(--green-600)]/30"
                  />
                  {category}
                </label>
              ))}
            </div>
          ) : (
            <p className="px-1.5 py-1 text-[13px] text-[var(--muted)]">No categories yet.</p>
          )}
          {selected.length ? (
            <button
              type="button"
              onClick={onClear}
              className="mt-2 w-full rounded-lg px-1.5 py-1.5 text-left text-[13px] font-semibold text-[var(--green-800)] hover:bg-[var(--green-50)]"
            >
              Clear filters
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function FarmersSearchBar({
  search, onSearchChange, location, onLocationChange, sort, onSortChange,
  categories, selectedCategories, onToggleCategory, onClearCategories,
}) {
  const locationOptions = [{ value: '', label: 'All locations' }, ...CEBU_MUNICIPALITIES.map((m) => ({ value: m, label: m }))];

  return (
    <div className="flex h-14 items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 shadow-sm">
      <Search size={17} className="shrink-0 text-[var(--muted)]" />
      <input
        type="search"
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder="Search farmers, farms, municipality…"
        aria-label="Search farmers"
        className="h-full min-w-0 flex-1 border-0 bg-transparent text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none"
      />
      <div className="hidden shrink-0 items-center gap-1 border-l border-[var(--line)] pl-2 sm:flex">
        <InlineSelect value={location} onChange={onLocationChange} options={locationOptions} ariaLabel="Filter by location" />
      </div>
      <div className="hidden shrink-0 items-center gap-1 border-l border-[var(--line)] pl-2 sm:flex">
        <InlineSelect value={sort} onChange={onSortChange} options={SORT_OPTIONS} ariaLabel="Sort farmers" />
      </div>
      <div className="border-l border-[var(--line)] pl-2">
        <FilterPopover categories={categories} selected={selectedCategories} onToggle={onToggleCategory} onClear={onClearCategories} />
      </div>
    </div>
  );
}
