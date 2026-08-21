import { ChevronLeft, ChevronRight } from 'lucide-react';

// Client-side pagination over an already-fetched list (see AllFarmersPage.jsx) — the
// directory's full farmer list is one lightweight public call, so there's no need for real
// server-side paging, just slicing 12-at-a-time the same way the page already sorts/filters
// client-side.
function pageNumbers(current, total) {
  if (total <= 5) return Array.from({ length: total }, (_, index) => index + 1);
  const pages = new Set([1, total, current, current - 1, current + 1]);
  return [...pages].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b);
}

export default function FarmersPagination({ page, totalPages, onPageChange }) {
  if (totalPages <= 1) return null;

  const pages = pageNumbers(page, totalPages);

  return (
    <nav aria-label="Farmers pagination" className="mt-12 flex items-center justify-center gap-1.5">
      <button
        type="button"
        onClick={() => onPageChange(page - 1)}
        disabled={page === 1}
        aria-label="Previous page"
        className="flex h-9 items-center gap-1 rounded-lg px-2.5 text-[13px] font-semibold text-[var(--muted)] transition-colors hover:bg-[var(--soft)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
      >
        <ChevronLeft size={15} /> Previous
      </button>

      {pages.map((pageNumber, index) => {
        const previous = pages[index - 1];
        const showEllipsis = previous !== undefined && pageNumber - previous > 1;
        return (
          <span key={pageNumber} className="flex items-center gap-1.5">
            {showEllipsis ? <span className="px-1 text-[13px] text-[var(--text-faint)]">…</span> : null}
            <button
              type="button"
              onClick={() => onPageChange(pageNumber)}
              aria-current={pageNumber === page ? 'page' : undefined}
              className={`flex h-9 w-9 items-center justify-center rounded-lg text-[13px] font-semibold transition-colors ${
                pageNumber === page
                  ? 'bg-[var(--green-800)] text-white'
                  : 'text-[var(--muted)] hover:bg-[var(--soft)]'
              }`}
            >
              {pageNumber}
            </button>
          </span>
        );
      })}

      <button
        type="button"
        onClick={() => onPageChange(page + 1)}
        disabled={page === totalPages}
        aria-label="Next page"
        className="flex h-9 items-center gap-1 rounded-lg px-2.5 text-[13px] font-semibold text-[var(--muted)] transition-colors hover:bg-[var(--soft)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
      >
        Next <ChevronRight size={15} />
      </button>
    </nav>
  );
}
