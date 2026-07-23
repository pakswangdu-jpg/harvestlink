import { Search } from 'lucide-react';

const inputClass = 'h-10 rounded-lg border border-gray-200 bg-white px-3 text-[14px] font-medium text-gray-700 outline-none transition-colors duration-200 focus:border-green-600';

export default function ProductFilters({
  search, onSearchChange,
  categoryFilter, onCategoryFilterChange, categoryOptions,
  statusFilter, onStatusFilterChange, statusOptions,
  gradeFilter, onGradeFilterChange,
  salesTypeFilter, onSalesTypeFilterChange,
  sortBy, onSortByChange, sortOptions,
}) {
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <label className={`flex min-w-[220px] flex-1 items-center gap-2 ${inputClass}`} htmlFor="product-search">
        <Search size={16} strokeWidth={2} className="shrink-0 text-gray-400" />
        <input
          id="product-search"
          className="w-full border-0 bg-transparent p-0 text-[14px] font-medium text-gray-700 outline-none"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search products"
        />
      </label>

      <select className={inputClass} value={categoryFilter} onChange={(event) => onCategoryFilterChange(event.target.value)} aria-label="Filter by category">
        <option value="all">All categories</option>
        {categoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}
      </select>

      <select className={inputClass} value={statusFilter} onChange={(event) => onStatusFilterChange(event.target.value)} aria-label="Filter by status">
        {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>

      <select className={inputClass} value={gradeFilter} onChange={(event) => onGradeFilterChange(event.target.value)} aria-label="Filter by grade">
        <option value="all">All grades</option>
        <option value="A">Grade A</option>
        <option value="B">Grade B</option>
      </select>

      <select className={inputClass} value={salesTypeFilter} onChange={(event) => onSalesTypeFilterChange(event.target.value)} aria-label="Filter by sales type">
        <option value="all">Retail &amp; Wholesale</option>
        <option value="retail">Retail only</option>
        <option value="wholesale">Wholesale only</option>
      </select>

      <select className={inputClass} value={sortBy} onChange={(event) => onSortByChange(event.target.value)} aria-label="Sort listings">
        {sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </div>
  );
}
