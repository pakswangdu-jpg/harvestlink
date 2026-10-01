



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





          <span className={`kpi-card-icon kpi-card-icon-image flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--soft)] ${iconClassName}`.trim()} aria-hidden="true">
            <img src={iconSrc} alt="" width={20} height={20} className="h-5 w-5 object-contain" />
          </span>
        ) : (
          <span className={`kpi-card-icon flex h-9 w-9 shrink-0 items-center justify-center ${iconClassName}`.trim()} style={{ color: iconColor }} aria-hidden="true">
            {


                                                     }
            <Icon size={20} strokeWidth={2.5} />
          </span>
        )}
        <h3 className="truncate text-[13px] font-medium text-[var(--muted)]">{label}</h3>
      </div>
      <div className="mt-3">
        <p className="whitespace-nowrap text-[28px] font-medium leading-none tracking-tight tabular-nums text-[var(--text)]">{value}</p>
        {hint ? <p className="mt-1.5 text-[12px] text-[var(--muted)]">{hint}</p> : null}
      </div>
    </article>
  );
}
