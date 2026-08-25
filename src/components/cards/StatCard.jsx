import { createElement } from 'react';

// `iconClassName` is opt-in (e.g. dropping the icon's badge box for one specific card) — every
// existing caller that omits it keeps the icon in its default muted/soft badge, unchanged.
export default function StatCard({
  label, value, icon, hint, tone = 'neutral', iconClassName = '',
}) {
  const Icon = typeof icon === 'function' ? icon : null;
  return (
    <article className={`stat-card stat-card-tone-${tone}`}>
      <div className={`stat-icon ${iconClassName}`.trim()}>
        {Icon ? createElement(Icon, { size: 23, strokeWidth: 2.35 }) : icon}
      </div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        {hint ? <small className="stat-card-hint">{hint}</small> : null}
      </div>
    </article>
  );
}
