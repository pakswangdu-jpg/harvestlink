import { Search } from 'lucide-react';

// Search + a compact segmented status strip — the category/grade/sales-type/sort controls the
// old toolbar had are gone on purpose (see FarmerProducts.jsx), not because that data stopped
// existing: a small farmer catalog doesn't need a five-control filter panel to find one
// listing, and the brief this shipped for was explicit about keeping this toolbar this simple.
export default function ProductFilters({
  search, onSearchChange, statusFilter, onStatusFilterChange, statusTabs,
}) {
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <label className="search-field flex h-10 w-full max-w-[280px] items-center rounded-lg border border-[var(--line)] bg-[var(--input-bg)] px-3" htmlFor="product-search">
        <Search size={15} className="shrink-0 text-[var(--muted)]" aria-hidden="true" />
        <input
          id="product-search"
          className="w-full border-0 bg-transparent p-0 text-[13px] text-[var(--text)] outline-none placeholder:text-[var(--muted)]"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search products..."
        />
      </label>

      <div className="filter-tabs" role="tablist" aria-label="Filter by product status">
        {statusTabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={statusFilter === tab.value}
            className={`filter-tab ${statusFilter === tab.value ? 'active' : ''}`}
            onClick={() => onStatusFilterChange(tab.value)}
          >
            {tab.label}
            <span className="filter-tab-count">{tab.count}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
