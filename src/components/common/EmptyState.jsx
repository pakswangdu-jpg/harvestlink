import { Inbox } from 'lucide-react';
import Button from './Button';

export default function EmptyState({ title, message, actionLabel, onAction, icon: Icon = Inbox }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Icon size={24} />
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
