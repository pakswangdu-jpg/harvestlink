import { useMemo, useState } from 'react';



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
