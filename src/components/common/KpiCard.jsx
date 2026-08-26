// No badge box — accent color lives directly on the icon (never the whole card; a "Pending"
// card that turns fully orange reads as an alert banner, not a stat you scan alongside the
// others next to it). `variant` is optional — omitted (or anything unrecognized) falls back
// to the same neutral slate every other card uses.
const ICON_TONE = {
  default: 'var(--muted)',
  warning: 'var(--amber-700)',
  success: 'var(--green-700)',
};

export default function KpiCard({
  label, value, hint, icon: Icon, iconSrc, variant = 'default', tone = 'default', iconClassName = '',
}) {
  const iconColor = ICON_TONE[variant] || ICON_TONE.default;
  return (
    <article
      className={`kpi-card kpi-card-tone-${tone} flex min-h-[120px] flex-col justify-between rounded-xl border border-[var(--line)] bg-[var(--panel)] px-[22px] py-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-[transform,box-shadow,border-color] duration-150 ease-out hover:-translate-y-px hover:border-[var(--muted)] hover:shadow-[0_4px_10px_rgba(15,23,42,0.07)]`}
    >
      <div className="flex items-center gap-2.5">
        {iconSrc ? (
          // A full-color PNG (unlike the lucide icons below) can't take a currentColor tint,
          // so it needs real visual containment instead — floating one raw on the card's bare
          // background is what read as an unstyled clip-art sticker rather than a real product
          // icon. A soft neutral badge (not an accent color — see ICON_TONE's own reasoning
          // above) houses it the same way every other icon badge in the app already does.
          <span className={`kpi-card-icon kpi-card-icon-image flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--soft)] ${iconClassName}`.trim()} aria-hidden="true">
            <img src={iconSrc} alt="" width={20} height={20} className="h-5 w-5 object-contain" />
          </span>
        ) : (
          <span className={`kpi-card-icon flex h-9 w-9 shrink-0 items-center justify-center ${iconClassName}`.trim()} style={{ color: iconColor }} aria-hidden="true">
            {/* Lucide's default stroke (2) reads noticeably thin next to the card's own bold
                (700) label — same fix, same reasoning, as SIDEBAR_ICON_STROKE in
                SidebarNavItem.jsx: a heavier stroke so the icon doesn't look like the
                lightest-weight thing on the card. */}
            <Icon size={20} strokeWidth={2.5} />
          </span>
        )}
        <h3 className="truncate text-[13px] font-medium text-[var(--muted)]">{label}</h3>
      </div>
      <div className="mt-3">
        <p className="whitespace-nowrap text-[28px] font-bold leading-none tracking-tight text-[var(--text)]">{value}</p>
        {hint ? <p className="mt-1.5 text-[12px] text-[var(--muted)]">{hint}</p> : null}
      </div>
    </article>
  );
}
