// Replaces AppShell's own shared <header> (used via the `fullBleed` prop) for the admin
// section specifically — that shared header's title clamps up to ~50px, which reads as
// exactly the "giant heading" this redesign is meant to avoid. This is the compact,
// spec-exact 30px/semibold equivalent, scoped to admin only.
export default function PageHeader({ title, description, action }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-[30px] font-semibold leading-tight text-[var(--text)]">{title}</h1>
        {description ? <p className="mt-1 text-[13px] text-[var(--muted)]">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
