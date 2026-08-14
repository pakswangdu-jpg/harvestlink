// Two supported layouts: 4 cards (2-col tablet -> 4-col desktop, 20px gap) and 5 cards
// (2-col tablet -> 3-col large tablet -> 5-col desktop, 16px gap, since 5 doesn't divide
// evenly into the 4-card breakpoints without either a narrow gap or a stranded card). Both
// stay a plain CSS grid — no per-card width math to keep in sync — and every track already
// can't grow past its share of the row, so a long label still truncates instead of
// stretching the row.
const GRID_PRESETS = {
  4: 'gap-5 sm:grid-cols-2 lg:grid-cols-4',
  5: 'gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5',
};

export default function KpiGrid({ children, columns = 4 }) {
  return (
    <div className={`grid grid-cols-1 ${GRID_PRESETS[columns] || GRID_PRESETS[4]}`}>
      {children}
    </div>
  );
}
