// Compares treating null/undefined as "always last" regardless of direction — a commodity
// with no PSA data or no farmer listings shouldn't clutter the top of a "highest price"/
// "most listings" sort just because null happens to compare oddly with numbers.
function compareNullsLast(a, b, direction) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return direction === 'asc' ? a - b : b - a;
}

const COMPARATORS = {
  newest: (a, b) => (b.override?.updatedAt || '').localeCompare(a.override?.updatedAt || '') || a.label.localeCompare(b.label),
  'price-asc': (a, b) => compareNullsLast(a.referencePrice, b.referencePrice, 'asc'),
  'price-desc': (a, b) => compareNullsLast(a.referencePrice, b.referencePrice, 'desc'),
  'avgfarmer-asc': (a, b) => compareNullsLast(a.avgFarmerPrice, b.avgFarmerPrice, 'asc'),
  'avgfarmer-desc': (a, b) => compareNullsLast(a.avgFarmerPrice, b.avgFarmerPrice, 'desc'),
  'listings-asc': (a, b) => a.listingsCount - b.listingsCount,
  'listings-desc': (a, b) => b.listingsCount - a.listingsCount,
  'label-asc': (a, b) => a.label.localeCompare(b.label),
  'label-desc': (a, b) => b.label.localeCompare(a.label),
};

export const SORT_PRESETS = [
  { value: 'newest', label: 'Newest' },
  { value: 'price-desc', label: 'Highest Price' },
  { value: 'price-asc', label: 'Lowest Price' },
  { value: 'listings-desc', label: 'Most Listings' },
];

export function sortCommodities(rows, sortKey) {
  const comparator = COMPARATORS[sortKey] || COMPARATORS.newest;
  return [...rows].sort(comparator);
}
