import { useEffect, useRef, useState } from 'react';
import { Bell, Gift, MapPin, MessageCircle, Package, ShieldCheck, TrendingUp, Wallet, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useOptionalToast } from '../../contexts/ToastContext';
import {
  deleteNotification,
  getNotificationsForUser,
  markAllNotificationsRead,
  markNotificationRead,
} from '../../services/notificationService';
import {
  disablePushNotifications,
  enablePushNotifications,
  getPushSubscriptionStatus,
  sendTestPushNotification,
} from '../../services/pushNotificationService';
import { useNotificationsRealtime } from '../../hooks/useNotificationsRealtime';
import { formatRelativeTime } from '../../utils/formatters';
import { playNotificationSound } from '../../utils/notificationSound';
import { areBrowserNotificationsEnabled, showBrowserNotification } from '../../utils/browserNotifications';
import { isOrderCancellationNotification, notificationMessage, notificationTitle } from './notificationPresentation';

const TYPE_ICONS = {
  order: Package,
  message: MessageCircle,
  payment: Wallet,
  verification: ShieldCheck,
  donation: Gift,
  market_price: TrendingUp,
  profile: MapPin,
};

export default function NotificationBell({ userId }) {
  const navigate = useNavigate();
  const { showToast } = useOptionalToast();
  const wrapperRef = useRef(null);
  const seenNotificationIdsRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [pushStatus, setPushStatus] = useState({ supported: true, permission: 'default', subscribed: false });
  const [pushBusy, setPushBusy] = useState(false);
  const [pushNotice, setPushNotice] = useState('');

  const showNotificationPopup = (notification) => {
    if (!notification?.id) return;
    if (!seenNotificationIdsRef.current) seenNotificationIdsRef.current = new Set();
    if (seenNotificationIdsRef.current.has(notification.id)) return;
    seenNotificationIdsRef.current.add(notification.id);

    const title = notificationTitle(notification);
    const message = notificationMessage(notification);
    const isDeliveryPriceAlert = /delivery arrangement|exact amount/i.test(`${title} ${message}`);
    showToast({
      type: 'info',
      title,
      message,
      duration: isDeliveryPriceAlert ? 7000 : 4500,
      ...(notification.link ? {
        actionLabel: 'View',
        onAction: () => navigate(notification.link),
      } : {}),
    });
  };

  const refresh = () => getNotificationsForUser(userId).then((items) => {
    setNotifications(items);
    if (seenNotificationIdsRef.current === null) {
      seenNotificationIdsRef.current = new Set(items.map((item) => item.id));
      return;
    }
    const newlyArrived = items.filter((item) => !item.read && !seenNotificationIdsRef.current.has(item.id));
    if (newlyArrived.length) {
      newlyArrived.slice(0, 2).forEach((item) => {
        showNotificationPopup(item);
      });
    }
  });

  useEffect(() => {
    refresh();

    const interval = setInterval(refresh, 4000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    getPushSubscriptionStatus(userId).then((status) => {
      if (!cancelled) setPushStatus(status);
    });
    return () => { cancelled = true; };
  }, [userId, isOpen]);

  useNotificationsRealtime(userId, (notification) => {
    setNotifications((previous) => (
      previous.some((existing) => existing.id === notification.id) ? previous : [notification, ...previous]
    ));
    showNotificationPopup(notification);
    playNotificationSound();
    // Avoid duplicating OS notifications when Web Push is already active on this device.
    if (!pushStatus.subscribed && areBrowserNotificationsEnabled(userId)) {
      showBrowserNotification(notification);
    }
  });

  const handleEnablePush = async () => {
    if (pushBusy) return;
    setPushBusy(true);
    setPushNotice('');
    try {
      const result = await enablePushNotifications(userId);
      const next = await getPushSubscriptionStatus(userId);
      setPushStatus(next);
      if (result.enabled) {
        setPushNotice('Push notifications enabled on this device.');
      } else if (result.permission === 'denied') {
        setPushNotice('Notifications are blocked in your browser settings.');
      }
    } catch (error) {
      setPushNotice(error.message || 'Unable to enable push notifications.');
    } finally {
      setPushBusy(false);
    }
  };

  const handleDisablePush = async () => {
    if (pushBusy) return;
    setPushBusy(true);
    setPushNotice('');
    try {
      await disablePushNotifications();
      const next = await getPushSubscriptionStatus(userId);
      setPushStatus(next);
      setPushNotice('Push notifications disabled on this device.');
    } catch (error) {
      setPushNotice(error.message || 'Unable to disable push notifications.');
    } finally {
      setPushBusy(false);
    }
  };

  const handleSendTestPush = async () => {
    if (pushBusy) return;
    setPushBusy(true);
    setPushNotice('');
    try {
      const result = await sendTestPushNotification();
      setPushNotice(
        result.sent > 0
          ? `Test notification sent to ${result.sent} device${result.sent === 1 ? '' : 's'}.`
          : 'No active device accepted the test notification.',
      );
    } catch (error) {
      setPushNotice(error.message || 'Unable to send test notification.');
    } finally {
      setPushBusy(false);
    }
  };

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
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        aria-expanded={isOpen}
        title="Notifications"
      >
        <Bell size={20} aria-hidden="true" />
        {unreadCount > 0 ? <span className="notification-badge" aria-hidden="true">{unreadCount > 9 ? '9+' : unreadCount}</span> : null}
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
          <div className="notification-push-bar">
            {!pushStatus.supported ? (
              <span className="notification-push-note">Push notifications are not supported in this browser.</span>
            ) : pushStatus.permission === 'denied' ? (
              <span className="notification-push-note">Browser notifications are blocked in site settings.</span>
            ) : pushStatus.subscribed ? (
              <div className="notification-push-row">
                <span className="notification-push-status">Push notifications on</span>
                <div className="notification-push-actions">
                  <button
                    type="button"
                    className="notification-push-btn"
                    onClick={handleSendTestPush}
                    disabled={pushBusy}
                  >
                    {pushBusy ? 'Sending…' : 'Send test'}
                  </button>
                  <button
                    type="button"
                    className="notification-push-link"
                    onClick={handleDisablePush}
                    disabled={pushBusy}
                  >
                    Disable
                  </button>
                </div>
              </div>
            ) : (
              <div className="notification-push-row">
                <span className="notification-push-note">Get alerts even when this tab is closed.</span>
                <button
                  type="button"
                  className="notification-push-btn"
                  onClick={handleEnablePush}
                  disabled={pushBusy}
                >
                  {pushBusy ? 'Enabling…' : 'Enable Push Notifications'}
                </button>
              </div>
            )}
            {pushNotice ? <p className="notification-push-feedback">{pushNotice}</p> : null}
          </div>
          {notifications.length ? (
            <ul className="notification-list">
              {notifications.slice(0, 20).map((notification) => {
                const TypeIcon = TYPE_ICONS[notification.type] || Bell;
                const isCancellation = isOrderCancellationNotification(notification);
                return (
                  <li key={notification.id} className={`${notification.read ? '' : 'unread'}${isCancellation ? ' notification-cancelled' : ''}`.trim()}>
                    <Link to={notification.link || '#'} onClick={() => handleNotificationClick(notification)}>
                      <span className="notification-item-title">
                        <TypeIcon size={14} aria-hidden="true" />
                        <strong>{notificationTitle(notification)}</strong>
                      </span>
                      <span>{notificationMessage(notification)}</span>
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
