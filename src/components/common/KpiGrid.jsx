





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
