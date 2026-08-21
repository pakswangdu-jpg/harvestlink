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
        {eyebrow ? <p className="text-[12px] font-medium uppercase tracking-wide text-[var(--muted)]">{eyebrow}</p> : null}
        <h2 className="text-[20px] font-semibold leading-tight text-[var(--text)]">{title}</h2>
      </div>
      {action}
    </div>
  );
}
