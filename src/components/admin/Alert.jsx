import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react';

const TONE = {
  success: {
    bg: 'bg-[var(--green-100)]', text: 'text-[var(--green-800)]', border: 'border-[var(--green-800)]/20', Icon: CheckCircle2,
  },
  danger: {
    bg: 'bg-[var(--red-100)]', text: 'text-[var(--red-700)]', border: 'border-[var(--red-700)]/20', Icon: AlertCircle,
  },
  warning: {
    bg: 'bg-[var(--amber-100)]', text: 'text-[var(--amber-700)]', border: 'border-[var(--amber-700)]/20', Icon: AlertTriangle,
  },
  info: {
    bg: 'bg-[var(--blue-100)]', text: 'text-[var(--blue-700)]', border: 'border-[var(--blue-700)]/20', Icon: Info,
  },
};







export default function Alert({ tone = 'success', children }) {
  const { bg, text, border, Icon } = TONE[tone] || TONE.success;
  return (
    <div
      className={`mb-4 flex items-center gap-2 rounded-md border px-3 py-2 text-[13px] font-medium ${bg} ${text} ${border}`}
      role={tone === 'danger' ? 'alert' : 'status'}
    >
      <Icon size={15} className="shrink-0" />
      {children}
    </div>
  );
}
