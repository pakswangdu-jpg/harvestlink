import { TrendingDown, TrendingUp, Minus } from 'lucide-react';

const TREND_STYLES = {
  increasing: { icon: TrendingUp, bg: 'bg-[var(--green-50)]', text: 'text-[var(--green-700)]', label: 'Increasing' },
  stable: { icon: Minus, bg: 'bg-[var(--amber-100)]', text: 'text-[var(--amber-700)]', label: 'Stable' },
  decreasing: { icon: TrendingDown, bg: 'bg-[var(--red-100)]', text: 'text-[var(--red-700)]', label: 'Decreasing' },
};



export default function TrendIndicator({ trend }) {
  const style = TREND_STYLES[trend] || TREND_STYLES.stable;
  const Icon = style.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold ${style.bg} ${style.text}`}>
      <Icon size={13} strokeWidth={2.5} />
      {style.label}
    </span>
  );
}
