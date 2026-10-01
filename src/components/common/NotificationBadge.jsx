

export default function NotificationBadge({ count, collapsed = false }) {
  if (!count || count < 1) return null;

  if (collapsed) return <span className="notification-dot" aria-hidden="true" />;

  return <span className="nav-badge" aria-hidden="true">{count > 9 ? '9+' : count}</span>;
}
