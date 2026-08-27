import { useEffect, useRef, useState } from 'react';
import { Bell, Gift, MessageCircle, Package, ShieldCheck, Wallet, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  deleteNotification,
  getNotificationsForUser,
  markAllNotificationsRead,
  markNotificationRead,
} from '../../services/notificationService';
import { useNotificationsRealtime } from '../../hooks/useNotificationsRealtime';
import { formatRelativeTime } from '../../utils/formatters';
import { playNotificationSound } from '../../utils/notificationSound';
import { areBrowserNotificationsEnabled, showBrowserNotification } from '../../utils/browserNotifications';

const TYPE_ICONS = {
  order: Package,
  message: MessageCircle,
  payment: Wallet,
  verification: ShieldCheck,
  donation: Gift,
};

export default function NotificationBell({ userId }) {
  const wrapperRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);

  const refresh = () => getNotificationsForUser(userId).then(setNotifications);

  useEffect(() => {
    refresh();
    // Realtime (below) delivers new notifications instantly in the common case — this poll
    // stays as the resilient baseline, same "layered, not replaced" reasoning as
    // OrderTracking.jsx's own live-GPS realtime + poll combination.
    const interval = setInterval(refresh, 4000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Instant bell update the moment the backend creates a notification, instead of waiting up
  // to 4s for the next poll — also what "shows an in-app notification" while the tab is open
  // actually means here: a subtle chime plus the bell/badge updating immediately.
  useNotificationsRealtime(userId, (notification) => {
    setNotifications((previous) => (
      previous.some((existing) => existing.id === notification.id) ? previous : [notification, ...previous]
    ));
    playNotificationSound();
    if (areBrowserNotificationsEnabled(userId)) showBrowserNotification(notification);
  });

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const unreadCount = notifications.filter((notification) => !notification.read).length;

  const handleNotificationClick = async (notification) => {
    if (!notification.read) {
      await markNotificationRead(notification.id);
      refresh();
    }
    setIsOpen(false);
  };

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead(userId);
    refresh();
  };

  const handleDelete = async (event, id) => {
    event.preventDefault();
    event.stopPropagation();
    setNotifications((previous) => previous.filter((notification) => notification.id !== id));
    await deleteNotification(id).catch(() => refresh());
  };

  return (
    <div className="notification-bell" ref={wrapperRef}>
      <button
        type="button"
        className="notification-bell-toggle"
        onClick={() => setIsOpen((previous) => !previous)}
        aria-label="Notifications"
      >
        <Bell size={20} />
        {unreadCount > 0 ? <span className="notification-badge">{unreadCount > 9 ? '9+' : unreadCount}</span> : null}
      </button>

      {isOpen ? (
        <div className="notification-panel">
          <div className="notification-panel-header">
            <strong>Notifications</strong>
            {unreadCount > 0 ? (
              <button type="button" className="notification-mark-all" onClick={handleMarkAllRead}>
                Mark all read
              </button>
            ) : null}
          </div>
          {notifications.length ? (
            <ul className="notification-list">
              {notifications.slice(0, 20).map((notification) => {
                const TypeIcon = TYPE_ICONS[notification.type] || Bell;
                return (
                  <li key={notification.id} className={notification.read ? '' : 'unread'}>
                    <Link to={notification.link || '#'} onClick={() => handleNotificationClick(notification)}>
                      <span className="notification-item-title">
                        <TypeIcon size={14} />
                        <strong>{notification.title}</strong>
                      </span>
                      <span>{notification.message}</span>
                      <small>{formatRelativeTime(notification.createdAt)}</small>
                    </Link>
                    <button
                      type="button"
                      className="notification-delete-btn"
                      onClick={(event) => handleDelete(event, notification.id)}
                      aria-label="Delete notification"
                    >
                      <X size={13} />
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="notification-empty">No notifications yet.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
