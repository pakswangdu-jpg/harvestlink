// `onRowClick`/`selectedId` are opt-in — every existing caller that omits them keeps
// rendering plain, non-interactive rows. `column.width` (any CSS width value, e.g. "140px")
// and `column.truncate` (ellipsis + a title tooltip carrying the untruncated value) are also
// opt-in — a caller that omits them keeps the previous auto-width/no-wrap behavior.
// `emptyMessage` accepts either a plain string (unchanged) or `{ title, message }` for a
// two-line empty state.
export default function DataTable({ columns, rows, emptyMessage, onRowClick, selectedId }) {
  if (!rows.length) {
    if (emptyMessage && typeof emptyMessage === 'object') {
      return (
        <div className="table-empty table-empty-rich">
          <p className="table-empty-title">{emptyMessage.title}</p>
          <p className="table-empty-message">{emptyMessage.message}</p>
        </div>
      );
    }
    return <p className="table-empty">{emptyMessage}</p>;
  }

  return (
    <div className="table-wrap">
      <table>
        <colgroup>
          {columns.map((column) => (
            <col key={column.key} style={column.width ? { width: column.width } : undefined} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} className={column.align === 'right' ? 'table-cell-right' : undefined}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={[onRowClick && 'table-row-clickable', selectedId != null && row.id === selectedId && 'table-row-selected'].filter(Boolean).join(' ') || undefined}
            >
              {columns.map((column) => {
                const value = column.render ? column.render(row) : row[column.key];
                const className = [
                  column.truncate && 'table-cell-truncate',
                  column.align === 'right' && 'table-cell-right',
                ].filter(Boolean).join(' ') || undefined;
                return (
                  <td key={column.key} className={className} title={column.truncate ? row[column.key] : undefined}>
                    {value}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
