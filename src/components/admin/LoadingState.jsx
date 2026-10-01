


export default function LoadingState({ rows = 5 }) {
  return (
    <div className="space-y-2 py-1">
      {Array.from({ length: rows }, (_, index) => (
        <div key={`skeleton-row-${index}`} className="h-9 animate-pulse rounded-md bg-[var(--soft)]" />
      ))}
    </div>
  );
}
