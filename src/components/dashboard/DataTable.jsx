// `onRowClick`/`selectedId` are opt-in — every existing caller that omits them keeps
// rendering plain, non-interactive rows.
export default function DataTable({ columns, rows, emptyMessage, onRowClick, selectedId }) {
  if (!rows.length) {
    return <p className="table-empty">{emptyMessage}</p>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>{column.label}</th>
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
              {columns.map((column) => (
                <td key={column.key}>{column.render ? column.render(row) : row[column.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
