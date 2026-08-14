import { Inbox } from 'lucide-react';
import Button from './Button';

// `iconSrc` (an image path) is opt-in and wins over `icon` when both are given — every
// existing caller keeps rendering its lucide icon unchanged.
export default function EmptyState({
  title, message, actionLabel, onAction, icon: Icon = Inbox, iconSrc, compact = false, className = '',
}) {
  return (
    <div className={`empty-state${compact ? ' compact' : ''}${className ? ` ${className}` : ''}`.trim()}>
      <div className="empty-icon">
        {iconSrc ? <img src={iconSrc} alt="" width={compact ? 18 : 24} height={compact ? 18 : 24} /> : <Icon size={compact ? 18 : 24} />}
      </div>
      <h3>{title}</h3>
      <p>{message}</p>
      {actionLabel ? (
        <Button onClick={onAction} variant="secondary">
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
