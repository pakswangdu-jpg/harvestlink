import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';

const TONE = {
  increasing: { text: 'text-green-700', bg: 'bg-green-50', icon: ArrowUpRight },
  stable: { text: 'text-amber-700', bg: 'bg-amber-50', icon: Minus },
  decreasing: { text: 'text-red-700', bg: 'bg-red-50', icon: ArrowDownRight },
};

export default function PriceDifferenceCard({ currentPrice, predictedPrice, changePercent, trend, unit }) {
  const tone = TONE[trend] || TONE.stable;
  const Icon = tone.icon;
  const difference = predictedPrice - currentPrice;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-[12px] font-medium uppercase tracking-wide text-gray-500">Expected Price Change</p>
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
      <p className="mt-1 text-[13px] text-gray-500">per {unit}</p>
    </div>
  );
}
