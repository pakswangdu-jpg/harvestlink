

export function Card({ children, className = '', ...props }) {
  return (
    <section className={`rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5 ${className}`.trim()} {...props}>
      {children}
    </section>
  );
}




export function CardHeader({ eyebrow, title, action, className = '' }) {
  return (
    <div className={`mb-4 flex items-center justify-between gap-3 ${className}`.trim()}>
      <div>
        {


                                                  }
        {eyebrow ? <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--green-700)]">{eyebrow}</p> : null}
        <h2 className="text-[20px] font-bold leading-tight tracking-[-0.015em] text-[var(--text)]">{title}</h2>
      </div>
      {action}
    </div>
  );
}
