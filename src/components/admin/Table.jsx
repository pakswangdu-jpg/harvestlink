import EmptyState from './EmptyState';

// Dense, compact table — sticky header, 44px rows, thin separators, hover-only row state.
// Same {columns, rows, emptyMessage, onRowClick} contract as the legacy DataTable it
// replaces within admin, so swapping the import was the only change needed at call sites.
// `maxHeight` is opt-in (undefined = today's unbounded behavior, unchanged for every existing
// call site) — pass it where a list can grow past a handful of rows, and this becomes the same
// scrolling container the sticky header already needs, rather than letting the page grow
// unbounded underneath it.
export default function Table({
  columns, rows, emptyMessage, onRowClick, maxHeight,
}) {
  if (!rows.length) return <EmptyState message={emptyMessage} />;

  return (
    <div className="-mx-5 overflow-x-auto" style={maxHeight ? { maxHeight, overflowY: 'auto' } : undefined}>
      <table className="w-full min-w-full border-collapse text-left text-[13px]">
        <thead className="sticky top-0 z-10 bg-[var(--soft)]">
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                className="whitespace-nowrap border-b border-[var(--line)] px-3 py-2 text-[12px] font-semibold uppercase leading-tight tracking-wide text-[var(--muted)] first:pl-5 last:pr-5"
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={`h-11 border-b border-[var(--line)] transition-colors duration-150 hover:bg-[var(--soft)] ${onRowClick ? 'cursor-pointer' : ''}`}
            >
              {columns.map((column) => (
                <td key={column.key} className="whitespace-nowrap px-3 text-[13px] leading-tight text-[var(--text)] first:pl-5 last:pr-5">
                  {column.render ? column.render(row) : (row[column.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
