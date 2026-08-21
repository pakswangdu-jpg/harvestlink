import { Search } from 'lucide-react';
import { FarmerCard, FarmerCardSkeleton } from './FarmerCard';

const SKELETON_COUNT = 8;

function EmptyState({ onClearFilters }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-[var(--line)] py-20 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--soft)] text-[var(--text-faint)]">
        <Search size={20} />
      </span>
      <div>
        <p className="text-sm font-semibold text-[var(--text)]">No farmers found</p>
        <p className="mt-1 text-[13px] text-[var(--muted)]">Try changing your search or filters.</p>
      </div>
      <button
        type="button"
        onClick={onClearFilters}
        className="mt-1 rounded-lg border border-[var(--line)] px-4 py-2 text-[13px] font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--green-600)] hover:text-[var(--green-800)]"
      >
        Clear Filters
      </button>
    </div>
  );
}

export default function FarmersGrid({ farmers, isLoading, onClearFilters }) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-7 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: SKELETON_COUNT }, (_, index) => <FarmerCardSkeleton key={index} />)}
      </div>
    );
  }

  if (!farmers.length) return <EmptyState onClearFilters={onClearFilters} />;

  return (
    <div className="grid grid-cols-1 gap-7 sm:grid-cols-2 lg:grid-cols-4">
      {farmers.map((farmer) => <FarmerCard key={farmer.id} farmer={farmer} />)}
    </div>
  );
}
