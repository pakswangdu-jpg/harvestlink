import { Inbox } from 'lucide-react';
import Button from './Button';

export default function EmptyState({
  title, message, actionLabel, onAction, icon: Icon = Inbox, compact = false, className = '',
}) {
  return (
    <div className={`empty-state${compact ? ' compact' : ''}${className ? ` ${className}` : ''}`.trim()}>
      <div className="empty-icon">
        <Icon size={compact ? 18 : 24} />
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
