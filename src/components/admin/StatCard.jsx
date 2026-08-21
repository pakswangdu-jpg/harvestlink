import { TrendingDown, TrendingUp } from 'lucide-react';

// Named tones, not raw colors at each call site — keeps the palette centralized to one place
// and reuses this app's existing design tokens (the same --green-700/--blue-700/etc already
// used everywhere else) instead of inventing new ad-hoc colors per card. `bg`/`border` are both
// derived from each tone's existing token via color-mix rather than hand-picked hex values, so
// the four cards stay a genuinely unified system (same mix ratios) instead of four separately
// tuned colors that happen to look similar.
const TONES = {
  green: { base: 'var(--green-100)', accent: 'var(--green-700)' },
  blue: { base: 'var(--blue-100)', accent: 'var(--blue-700)' },
  // "Registered Users" — a cool blue-gray, not the app's generic neutral gray, so it reads as
  // a deliberate accent (people/accounts) rather than "the card with no color."
  slate: { base: 'var(--steel-100)', accent: 'var(--steel-700)' },
  amber: { base: 'var(--amber-100)', accent: 'var(--amber-700)' },
  violet: { base: 'var(--violet-100)', accent: 'var(--violet-700)' },
};

// Compact KPI tile — flat, minimal shadow, no gradient. `icon`/`iconSrc`/`tone` are all
// optional: the price-monitoring and admin-overview cards deliberately stay plain white/
// icon-less (denser grids where a colored badge per tile would be noise), only the reports
// summary cards pass them. `icon` (a lucide component) and `iconSrc` (an image path) are
// mutually exclusive — `iconSrc` wins if both are somehow given, since it's the more specific/
// deliberate choice. `trend` is optional too ({direction: 'up'|'down', label}) — only pass it
// where a genuine period-over-period comparison exists; omitting it renders nothing extra.
// `iconClassName` is opt-in (e.g. a "still waiting" animation on a specific card's icon) —
// every existing caller that omits it keeps the icon perfectly static.
export default function StatCard({
  label, value, hint, icon: Icon, iconSrc, tone, trend, iconClassName = '',
}) {
  const hasIcon = Icon || iconSrc;
  const { base, accent } = TONES[tone] || TONES.slate;

  const cardStyle = hasIcon
    ? {
      // Same two source tokens (base/accent) mixed at two ratios — a soft, mostly-panel-color
      // fill for the card, and a slightly more saturated version of the same hue for its
      // border — rather than a flat neutral border that would make four different-colored
      // cards look like they don't belong to the same set. Mixed toward --panel, not a literal
      // white, so this stays correct in Dark Mode too: --panel is white in Light Mode (same
      // result as before) and a dark surface in Dark Mode (a dark tinted card, not a stray
      // light pastel one).
      background: `color-mix(in srgb, ${base} 40%, var(--panel))`,
      borderColor: `color-mix(in srgb, ${accent} 28%, var(--panel))`,
    }
    : undefined;

  return (
    // h-full — without it, a shorter card (a one-line label) can end up visibly shorter than
    // its row partner (a label that wraps to two lines) on some widths instead of both filling
    // the grid row's full height, since a grid item only stretches by default as long as
    // nothing inside overrides its own height; asserting it here removes that ambiguity.
    <div className="h-full rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4" style={cardStyle}>
      <div className="flex items-center gap-3">
        {hasIcon ? (
          // No background of its own — sits directly on the card's tint (the PNGs are true
          // transparent-alpha, not opaque-white squares) rather than floating in a separate
          // white badge. Sized with Tailwind breakpoints, not one fixed px value, so it scales
          // down a step on the smallest phones instead of looking oversized in a narrower card.
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center sm:h-10 sm:w-10 ${iconClassName}`.trim()} style={{ color: accent }}>
            {iconSrc ? (
              <img src={iconSrc} alt="" width={22} height={22} className="h-5 w-5 object-contain sm:h-[22px] sm:w-[22px]" />
            ) : (
              <Icon size={20} strokeWidth={2} aria-hidden="true" />
            )}
          </div>
        ) : null}
        <div className="min-w-0">
          <p className="text-[12px] font-medium uppercase tracking-wide text-[var(--muted)]">{label}</p>
          <p className="mt-1 text-[22px] font-semibold leading-none text-[var(--text)]">{value}</p>
          {hint || trend ? (
            <p className="mt-1.5 flex items-center gap-1 text-[12px] text-[var(--muted)]">
              {trend ? (
                <span className={`inline-flex items-center gap-0.5 font-medium ${trend.direction === 'down' ? 'text-[var(--red-700)]' : 'text-[var(--green-700)]'}`}>
                  {trend.direction === 'down' ? <TrendingDown size={12} strokeWidth={2.5} /> : <TrendingUp size={12} strokeWidth={2.5} />}
                  {trend.label}
                </span>
              ) : null}
              {hint}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
