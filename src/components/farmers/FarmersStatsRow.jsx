// Thin, divider-separated stat row — deliberately not colorful cards, just numbers that
// read like a trust signal (Airbnb/Stripe "at a glance" strip), computed from the full
// (unfiltered) farmer list so it reads as "the whole platform," not "this search result."
function Stat({ value, label }) {
  return (
    <div className="flex flex-1 flex-col items-center gap-0.5 px-4 py-2 text-center sm:px-6">
      <span className="text-2xl font-bold tracking-tight text-[var(--text)]">{value}</span>
      <span className="text-[12.5px] font-medium text-[var(--muted)]">{label}</span>
    </div>
  );
}

export default function FarmersStatsRow({ farmerCount, averageRating, productCount, cityCount }) {
  return (
    <div className="mx-auto flex max-w-3xl divide-x divide-[var(--line)] rounded-xl border border-[var(--line)] bg-[var(--panel)]">
      <Stat value={farmerCount} label="Verified Farmers" />
      <Stat value={averageRating ? averageRating.toFixed(1) : '—'} label="Average Rating" />
      <Stat value={productCount} label="Products Listed" />
      <Stat value={cityCount} label="Cities Covered" />
    </div>
  );
}
