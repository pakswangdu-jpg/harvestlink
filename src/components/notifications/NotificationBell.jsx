import { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  getNotificationsForUser,
  markAllNotificationsRead,
  markNotificationRead,
} from '../../services/notificationService';
import { STORAGE_KEYS } from '../../utils/constants';
import { formatRelativeTime } from '../../utils/formatters';

export default function NotificationBell({ userId }) {
  const wrapperRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState(() => getNotificationsForUser(userId));

  useEffect(() => {
    const refresh = () => setNotifications(getNotificationsForUser(userId));
    const handleStorage = (event) => {
      if (!event.key || event.key === STORAGE_KEYS.notifications) refresh();
    };
    const interval = setInterval(refresh, 4000);
    window.addEventListener('storage', handleStorage);
    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', handleStorage);
    };
  }, [userId]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const unreadCount = notifications.filter((notification) => !notification.read).length;

  const handleNotificationClick = (notification) => {
    if (!notification.read) {
      markNotificationRead(notification.id);
      setNotifications(getNotificationsForUser(userId));
    }
    setIsOpen(false);
  };

  const handleMarkAllRead = () => {
    markAllNotificationsRead(userId);
    setNotifications(getNotificationsForUser(userId));
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
              {notifications.slice(0, 20).map((notification) => (
                <li key={notification.id} className={notification.read ? '' : 'unread'}>
                  <Link to={notification.link || '#'} onClick={() => handleNotificationClick(notification)}>
                    <strong>{notification.title}</strong>
                    <span>{notification.message}</span>
                    <small>{formatRelativeTime(notification.createdAt)}</small>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="notification-empty">No notifications yet.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
