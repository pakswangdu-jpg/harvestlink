import EmptyState from './EmptyState';

// Dense, compact table — sticky header, 44px rows, thin separators, hover-only row state.
// Same {columns, rows, emptyMessage, onRowClick} contract as the legacy DataTable it
// replaces within admin, so swapping the import was the only change needed at call sites.
export default function Table({ columns, rows, emptyMessage, onRowClick }) {
  if (!rows.length) return <EmptyState message={emptyMessage} />;

  return (
    <div className="-mx-5 overflow-x-auto">
      <table className="w-full min-w-full border-collapse text-left text-[13px]">
        <thead className="sticky top-0 z-10 bg-[#F6F8FA]">
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                className="whitespace-nowrap border-b border-[#D0D7DE] px-3 py-2 text-[12px] font-semibold uppercase tracking-wide text-[#57606A] first:pl-5 last:pr-5"
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
              className={`h-11 border-b border-[#D0D7DE] transition-colors duration-150 hover:bg-[#F6F8FA] ${onRowClick ? 'cursor-pointer' : ''}`}
            >
              {columns.map((column) => (
                <td key={column.key} className="whitespace-nowrap px-3 text-[13px] text-[#24292F] first:pl-5 last:pr-5">
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
