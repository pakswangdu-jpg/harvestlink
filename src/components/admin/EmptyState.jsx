import { Inbox } from 'lucide-react';

export default function EmptyState({ title, message, icon: Icon = Inbox }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <Icon size={18} strokeWidth={1.75} className="text-[#57606A]" />
      {title ? <p className="text-[13px] font-medium text-[#24292F]">{title}</p> : null}
      <p className="max-w-xs text-[13px] text-[#57606A]">{message}</p>
    </div>
  );
}
