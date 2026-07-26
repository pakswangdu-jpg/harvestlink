import { ChevronLeft, ChevronRight } from 'lucide-react';

// Client-side pagination — the admin tables already fetch their full dataset into state (no
// backend paging endpoint exists), so this just slices what's already loaded. Introduced
// fresh for this redesign (no prior pagination existed anywhere in the app to preserve).
export default function Pagination({ page, pageSize, total, onPageChange }) {
  if (total <= pageSize) return null;
  const totalPages = Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="mt-3 flex items-center justify-between border-t border-[#D0D7DE] pt-3">
      <p className="text-[12px] text-[#57606A]">
        Showing <span className="font-medium text-[#24292F]">{start}–{end}</span> of <span className="font-medium text-[#24292F]">{total}</span>
      </p>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-[#D0D7DE] bg-white text-[#57606A] transition-colors duration-150 hover:bg-[#F6F8FA] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft size={14} />
        </button>
        <span className="px-1 text-[12px] text-[#57606A]">{page} / {totalPages}</span>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-[#D0D7DE] bg-white text-[#57606A] transition-colors duration-150 hover:bg-[#F6F8FA] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
