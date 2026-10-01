import EmptyState from './EmptyState';












const MIN_COLUMN_WIDTH_PX = 120;

export default function Table({
  columns, rows, emptyMessage, onRowClick, maxHeight,
}) {
  if (!rows.length) return <EmptyState message={emptyMessage} />;

  return (
    <div className="-mx-5 overflow-x-auto" style={maxHeight ? { maxHeight, overflowY: 'auto' } : undefined}>
      {







                                         }
      <table className="w-full border-collapse text-left text-[13px]" style={{ minWidth: columns.length * MIN_COLUMN_WIDTH_PX }}>
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




                <td
                  key={column.key}
                  className="max-w-0 truncate px-3 text-[13px] leading-tight text-[var(--text)] first:pl-5 last:pr-5"
                  title={column.render ? undefined : String(row[column.key] ?? '')}
                >
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
