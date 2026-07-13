// Frozen, localStorage-backed snapshot of the pre-migration notificationService.js — kept
// only so donationService.js (not yet migrated to the backend) still has a synchronous
// createNotification() to call. Do not add new features here.
import { STORAGE_KEYS } from '../../utils/constants';
import { createId, readStorage, writeStorage } from '../storageService';

export function getNotifications() {
  return readStorage(STORAGE_KEYS.notifications, []);
}

export function saveNotifications(notifications) {
  return writeStorage(STORAGE_KEYS.notifications, notifications);
}

export function getNotificationsForUser(userId) {
  return getNotifications()
    .filter((notification) => notification.userId === userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export function getUnreadCount(userId) {
  return getNotifications().filter((notification) => notification.userId === userId && !notification.read).length;
}

export function createNotification({ userId, type, title, message, link }) {
  const notification = {
    id: createId('notif'),
    userId,
    type,
    title,
    message,
    link: link || null,
    read: false,
    createdAt: new Date().toISOString(),
  };
  saveNotifications([notification, ...getNotifications()]);
  return notification;
}

export function markNotificationRead(id) {
  const updated = getNotifications().map((notification) =>
    notification.id === id ? { ...notification, read: true } : notification
  );
  saveNotifications(updated);
}

export function markAllNotificationsRead(userId) {
  const updated = getNotifications().map((notification) =>
    notification.userId === userId ? { ...notification, read: true } : notification
  );
  saveNotifications(updated);
}
