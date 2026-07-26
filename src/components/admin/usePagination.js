import { useMemo, useState } from 'react';

// Clamps back to the last valid page automatically (e.g. after a filter shrinks the row
// count) instead of stranding the caller on an empty page.
export function usePagination(rows, pageSize = 10) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = useMemo(
    () => rows.slice((safePage - 1) * pageSize, safePage * pageSize),
    [rows, safePage, pageSize]
  );
  return {
    page: safePage, setPage, pageRows, pageSize, total: rows.length,
  };
}
