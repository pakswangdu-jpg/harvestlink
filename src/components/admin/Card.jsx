// Flat card — thin border, 8px radius, no shadow. The one container every admin section
// wraps its content in, so spacing/borders stay identical page to page.
export function Card({ children, className = '', ...props }) {
  return (
    <section className={`rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5 ${className}`.trim()} {...props}>
      {children}
    </section>
  );
}

// The eyebrow+title+action row every panel in this section used to hand-roll individually
// (`.section-heading`/`.eyebrow`) — now one component, so title size/weight/spacing can
// never drift between pages.
export function CardHeader({ eyebrow, title, action, className = '' }) {
  return (
    <div className={`mb-4 flex items-center justify-between gap-3 ${className}`.trim()}>
      <div>
        {/* Matches the weight/color/tracking of the app's other .eyebrow/.section-heading h2
            (Farmer's dashboard, etc.) — this used to be noticeably lighter (font-medium gray,
            tracking-wide) instead of the same bold, green-accented, wide-tracked treatment
            every other dashboard already uses. */}
        {eyebrow ? <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--green-700)]">{eyebrow}</p> : null}
        <h2 className="text-[20px] font-bold leading-tight tracking-[-0.015em] text-[var(--text)]">{title}</h2>
      </div>
      {action}
    </div>
  );
}
