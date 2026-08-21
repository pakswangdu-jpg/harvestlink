// Rendered directly on the bare page background (not inside a .panel), which is itself
// `var(--soft)` — using that same token here would make the block genuinely invisible
// instead of just subtle. `--panel` is the page's next tone up, so it reads as a visible
// pulsing block against the page behind it.
function Block({ className }) {
  return <div className={`animate-pulse rounded-lg bg-[var(--panel)] ${className}`} />;
}

// Mirrors the real layout's shape (metric grid + chart + summary cards) so the page never
// visibly "jumps" once real data replaces it.
export default function ForecastSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Block key={index} className="h-24" />
        ))}
      </div>
      <Block className="h-80" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Block className="h-32" />
        <Block className="h-32" />
      </div>
    </div>
  );
}
