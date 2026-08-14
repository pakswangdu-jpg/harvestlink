// `iconClassName` is opt-in (e.g. dropping the icon's badge box for one specific card) — every
// existing caller that omits it keeps the icon in its default muted/soft badge, unchanged.
export default function StatCard({
  label, value, icon, hint, iconClassName = '',
}) {
  return (
    <article className="stat-card">
      <div className={`stat-icon ${iconClassName}`.trim()}>{icon}</div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        {hint ? <small className="stat-card-hint">{hint}</small> : null}
      </div>
    </article>
  );
}
