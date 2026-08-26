import EmptyState from './EmptyState';

// Dense, compact table — sticky header, 44px rows, thin separators, hover-only row state.
// Same {columns, rows, emptyMessage, onRowClick} contract as the legacy DataTable it
// replaces within admin, so swapping the import was the only change needed at call sites.
// `maxHeight` is opt-in (undefined = today's unbounded behavior, unchanged for every existing
// call site) — pass it where a list can grow past a handful of rows, and this becomes the same
// scrolling container the sticky header already needs, rather than letting the page grow
// unbounded underneath it.
// Below this, a column simply doesn't have room to show useful content at all — matches the
// compact 120px this table's own columns already read comfortably at (NAME/ROLE/CREATED-style
// labels). Below the min-width this produces, the wrapper's own horizontal scroll takes over
// instead of forcing every column to keep shrinking.
const MIN_COLUMN_WIDTH_PX = 120;

export default function Table({
  columns, rows, emptyMessage, onRowClick, maxHeight,
}) {
  if (!rows.length) return <EmptyState message={emptyMessage} />;

  return (
    <div className="-mx-5 overflow-x-auto" style={maxHeight ? { maxHeight, overflowY: 'auto' } : undefined}>
      {/* min-width (a real px floor, not min-w-full's 100%-of-container) is what actually
          matters here — width:100% alone doesn't stop table-layout:auto from shrinking every
          column below its natural content width once there are enough columns to not fit the
          container (a 6-column admin table on a narrow screen, for instance). Once that
          happens, max-w-0 + truncate below just clips visible text to a sliver instead of
          fixing the real problem, which is the table having nowhere near enough room to begin
          with. A real min-width instead lets the wrapper's overflow-x-auto scroll horizontally
          — the table stays fully readable, just scrollable, exactly as a dense data table on a
          narrow screen should behave. */}
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
                // truncate (max-w-0 + overflow-hidden + ellipsis), not just nowrap — with a
                // real min-width on the table now guaranteeing every column has reasonable
                // room, this only ever clips a genuinely unusual outlier value (an especially
                // long name), never a whole column's worth of otherwise-normal content.
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
