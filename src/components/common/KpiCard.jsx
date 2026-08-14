// No badge box — accent color lives directly on the icon (never the whole card; a "Pending"
// card that turns fully orange reads as an alert banner, not a stat you scan alongside the
// others next to it). `variant` is optional — omitted (or anything unrecognized) falls back
// to the same neutral slate every other card uses.
const ICON_TONE = {
  default: '#475569',
  warning: '#B45309',
  success: '#15803D',
};

export default function KpiCard({
  label, value, hint, icon: Icon, iconSrc, variant = 'default', iconClassName = '',
}) {
  const iconColor = ICON_TONE[variant] || ICON_TONE.default;
  return (
    <article
      className="flex min-h-[120px] flex-col justify-between rounded-xl border border-[#E5E7EB] bg-white px-[22px] py-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-[transform,box-shadow,border-color] duration-150 ease-out hover:-translate-y-px hover:border-[#D1D5DB] hover:shadow-[0_4px_10px_rgba(15,23,42,0.07)]"
    >
      <div className="flex items-center gap-2.5">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center ${iconClassName}`.trim()} style={{ color: iconColor }} aria-hidden="true">
          {iconSrc ? <img src={iconSrc} alt="" width={32} height={32} className="h-8 w-8 object-contain" /> : <Icon size={20} strokeWidth={2} />}
        </span>
        <h3 className="truncate text-[13px] font-medium text-[#64748B]">{label}</h3>
      </div>
      <div className="mt-3">
        <p className="whitespace-nowrap text-[28px] font-bold leading-none tracking-tight text-[#0F172A]">{value}</p>
        {hint ? <p className="mt-1.5 text-[12px] text-[#94A3B8]">{hint}</p> : null}
      </div>
    </article>
  );
}
