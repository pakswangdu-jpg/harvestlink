import { Inbox } from 'lucide-react';
import Button from './Button';

export default function EmptyState({ title, message, actionLabel, onAction }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Inbox size={24} />
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
