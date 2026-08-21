import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';

const TONE = {
  increasing: { text: 'text-[var(--green-700)]', bg: 'bg-[var(--green-50)]', icon: ArrowUpRight },
  stable: { text: 'text-[var(--amber-700)]', bg: 'bg-[var(--amber-100)]', icon: Minus },
  decreasing: { text: 'text-[var(--red-700)]', bg: 'bg-[var(--red-100)]', icon: ArrowDownRight },
};

export default function PriceDifferenceCard({ currentPrice, predictedPrice, changePercent, trend, unit }) {
  const tone = TONE[trend] || TONE.stable;
  const Icon = tone.icon;
  const difference = predictedPrice - currentPrice;

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5 shadow-sm">
      <p className="text-[12px] font-medium uppercase tracking-wide text-[var(--muted)]">Expected Price Change</p>
      <div className="mt-2 flex items-center gap-2.5">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tone.bg} ${tone.text}`}>
          <Icon size={18} strokeWidth={2.5} />
        </span>
        <span className={`text-[22px] font-bold ${tone.text}`}>
          {difference > 0 ? '+' : ''}{formatCurrency(difference)}
        </span>
        <span className={`text-[15px] font-semibold ${tone.text}`}>
          ({changePercent > 0 ? '+' : ''}{changePercent}%)
        </span>
      </div>
      <p className="mt-1 text-[13px] text-[var(--muted)]">per {unit}</p>
    </div>
  );
}
