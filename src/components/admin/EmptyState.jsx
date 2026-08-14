import { Inbox } from 'lucide-react';

// `action` and `iconClassName` are both optional (a ready-made action node, and e.g. a
// "still waiting" animation class) so every existing caller that omits them keeps rendering
// the plain, static icon/title/message it always has. `iconSrc` (an image path) is also
// opt-in and wins over `icon` when both are given, same convention as common/EmptyState.jsx.
export default function EmptyState({
  title, message, icon: Icon = Inbox, iconSrc, action, compact = false, iconClassName = '',
}) {
  return (
    <div className={`flex flex-col items-center justify-center gap-2 text-center ${compact ? 'py-8' : 'py-12'}`}>
      {iconSrc ? (
        <img src={iconSrc} alt="" width={18} height={18} className={`h-[18px] w-[18px] object-contain ${iconClassName}`.trim()} />
      ) : (
        <Icon size={18} strokeWidth={1.75} className={`text-[var(--muted)] ${iconClassName}`.trim()} />
      )}
      {title ? <p className="text-[13px] font-medium text-[var(--text)]">{title}</p> : null}
      <p className="max-w-xs text-[13px] text-[var(--muted)]">{message}</p>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
