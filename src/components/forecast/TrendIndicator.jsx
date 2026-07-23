import { TrendingDown, TrendingUp, Minus } from 'lucide-react';

const TREND_STYLES = {
  increasing: { icon: TrendingUp, bg: 'bg-green-50', text: 'text-green-700', label: 'Increasing' },
  stable: { icon: Minus, bg: 'bg-amber-50', text: 'text-amber-700', label: 'Stable' },
  decreasing: { icon: TrendingDown, bg: 'bg-red-50', text: 'text-red-700', label: 'Decreasing' },
};

// Green = increasing, Yellow = stable, Red = decreasing — the one color rule this whole
// module keeps consistent everywhere a trend is shown (this pill, the chart, the summary).
export default function TrendIndicator({ trend }) {
  const style = TREND_STYLES[trend] || TREND_STYLES.stable;
  const Icon = style.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-semibold ${style.bg} ${style.text}`}>
      <Icon size={14} strokeWidth={2.5} />
      {style.label}
    </span>
  );
}
