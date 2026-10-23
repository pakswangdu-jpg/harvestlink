import { ListFilter, Search } from 'lucide-react';





export default function ProductFilters({
  search, onSearchChange, statusFilter, onStatusFilterChange, statusTabs,
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
