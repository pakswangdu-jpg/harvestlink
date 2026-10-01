import { TrendingDown, TrendingUp } from 'lucide-react';







const TONES = {
  green: { base: 'var(--green-100)', accent: 'var(--green-700)' },
  blue: { base: 'var(--blue-100)', accent: 'var(--blue-700)' },


  slate: { base: 'var(--steel-100)', accent: 'var(--steel-700)' },
  amber: { base: 'var(--amber-100)', accent: 'var(--amber-700)' },
  violet: { base: 'var(--violet-100)', accent: 'var(--violet-700)' },
};










export default function StatCard({
  label, value, hint, icon: Icon, iconSrc, tone, trend, iconClassName = '',
}) {
  const hasIcon = Icon || iconSrc;
  const { base, accent } = TONES[tone] || TONES.slate;

  const cardStyle = hasIcon
    ? {







      background: `color-mix(in srgb, ${base} 40%, var(--panel))`,
      borderColor: `color-mix(in srgb, ${accent} 28%, var(--panel))`,
    }
    : undefined;

  return (




    <div className="h-full rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4" style={cardStyle}>
      <div className="flex items-center gap-3">
        {hasIcon ? (




          <div className={`flex h-9 w-9 shrink-0 items-center justify-center sm:h-10 sm:w-10 ${iconClassName}`.trim()} style={{ color: accent }}>
            {iconSrc ? (
              <img src={iconSrc} alt="" width={22} height={22} className="h-5 w-5 object-contain sm:h-[22px] sm:w-[22px]" />
            ) : (
              <Icon size={20} strokeWidth={2} aria-hidden="true" />
            )}
          </div>
        ) : null}
        <div className="min-w-0">
          <p className="text-[12px] font-medium uppercase tracking-wide text-[var(--muted)]">{label}</p>
          <p className="mt-1 text-[22px] font-medium leading-none tabular-nums text-[var(--text)]">{value}</p>
          {hint || trend ? (
            <p className="mt-1.5 flex items-center gap-1 text-[12px] text-[var(--muted)]">
              {trend ? (
                <span className={`inline-flex items-center gap-0.5 font-medium ${trend.direction === 'down' ? 'text-[var(--red-700)]' : 'text-[var(--green-700)]'}`}>
                  {trend.direction === 'down' ? <TrendingDown size={12} strokeWidth={2.5} /> : <TrendingUp size={12} strokeWidth={2.5} />}
                  {trend.label}
                </span>
              ) : null}
              {hint}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
