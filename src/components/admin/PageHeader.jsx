



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
