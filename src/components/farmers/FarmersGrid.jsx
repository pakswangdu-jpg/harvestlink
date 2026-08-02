import { Search } from 'lucide-react';
import { FarmerCard, FarmerCardSkeleton } from './FarmerCard';

const SKELETON_COUNT = 8;

function EmptyState({ onClearFilters }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-gray-200 py-20 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-50 text-gray-300">
        <Search size={20} />
      </span>
      <div>
        <p className="text-sm font-semibold text-gray-900">No farmers found</p>
        <p className="mt-1 text-[13px] text-gray-500">Try changing your search or filters.</p>
      </div>
      <button
        type="button"
        onClick={onClearFilters}
        className="mt-1 rounded-lg border border-gray-200 px-4 py-2 text-[13px] font-semibold text-gray-700 transition-colors hover:border-green-600 hover:text-green-800"
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
