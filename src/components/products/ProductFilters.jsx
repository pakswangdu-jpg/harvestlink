import { ListFilter, Search } from 'lucide-react';





const SALES_TYPE_OPTIONS = [
  { value: 'all', label: 'All Products' },
  { value: 'retail', label: 'Retail' },
  { value: 'wholesale', label: 'Wholesale' },
];

export default function ProductFilters({
  search, onSearchChange, salesTypeFilter = 'all', onSalesTypeFilterChange,
  statusFilter, onStatusFilterChange, statusTabs,
}) {
  return (
    <div className="product-filters">
      <div className="product-filter-toolbar">
        <label className="search-field" htmlFor="product-search">
          <Search size={18} aria-hidden="true" />
          <input
            id="product-search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search your products..."
          />
        </label>

        {onSalesTypeFilterChange ? (
          <label className="product-filter-select product-sales-type-select" htmlFor="product-sales-type">
            <select
              id="product-sales-type"
              aria-label="Filter by sales type"
              value={salesTypeFilter}
              onChange={(event) => onSalesTypeFilterChange(event.target.value)}
            >
              {SALES_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="product-filter-select product-status-select" htmlFor="product-status">
          <ListFilter size={16} aria-hidden="true" />
          <select id="product-status" value={statusFilter} onChange={(event) => onStatusFilterChange(event.target.value)}>
            {statusTabs.map((tab) => (
              <option key={tab.value} value={tab.value}>
                {tab.value === 'all' ? 'All statuses' : tab.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
