import { Link } from 'react-router-dom';
import { Package } from 'lucide-react';
import { formatCurrency, shortOrderId, statusTone } from '../../utils/formatters';

const TONE_CLASSES = {
  good: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-700',
  critical: 'bg-red-50 text-red-700',
  neutral: 'bg-gray-100 text-gray-600',
};

// Pinned above the message list whenever this thread was opened from a specific order —
// every field here is that same real order the thread is scoped to (see MessagesPage.jsx),
// never a separate/derived summary.
export default function OrderContextCard({ order }) {
  if (!order) return null;
  const tone = TONE_CLASSES[statusTone(order.status)] || TONE_CLASSES.neutral;

  return (
    <div className="mx-4 mt-4 flex items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-700 shadow-sm">
          <Package size={18} />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Order #{shortOrderId(order.id)}</p>
          <p className="truncate text-[13px] font-semibold text-gray-800">
            {order.productName} · {order.quantity} {order.unit}
          </p>
          <p className="text-[12px] text-gray-500">{formatCurrency(order.totalAmount)}</p>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${tone}`}>{order.status}</span>
        <Link to={`/orders/${order.id}`} className="text-[12px] font-semibold text-emerald-700 hover:underline">
          Track order
        </Link>
      </div>
    </div>
  );
}
