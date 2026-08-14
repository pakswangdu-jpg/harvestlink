// Genuine loading rows (this section previously had no loading state at all — data just
// popped in, or briefly flashed an empty state, while the initial fetch was in flight).
// Opacity-only pulse, no motion/spring — matches this section's "very subtle" animation rule.
export default function LoadingState({ rows = 5 }) {
  return (
    <div className="space-y-2 py-1">
      {Array.from({ length: rows }, (_, index) => (
        <div key={`skeleton-row-${index}`} className="h-9 animate-pulse rounded-md bg-[var(--soft)]" />
      ))}
    </div>
  );
}
