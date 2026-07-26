import { AlertTriangle, CheckCircle2 } from 'lucide-react';

const TONE = {
  success: { bg: 'bg-[#DAFBE1]', text: 'text-[#1A7F37]', Icon: CheckCircle2 },
  danger: { bg: 'bg-[#FFEBE9]', text: 'text-[#CF222E]', Icon: AlertTriangle },
};

// Replaces the ad hoc `<div className="form-alert success/error">` every admin section used
// to hand-roll individually — one component, same look everywhere it's needed.
export default function Alert({ tone = 'success', children }) {
  const { bg, text, Icon } = TONE[tone] || TONE.success;
  return (
    <div className={`mb-4 flex items-center gap-2 rounded-md px-3 py-2 text-[13px] ${bg} ${text}`}>
      <Icon size={15} className="shrink-0" />
      {children}
    </div>
  );
}
