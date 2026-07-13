import { apiClient } from './apiClient';

// Every function here now talks to the real backend instead of localStorage — see
// backend/src/routes/notifications.routes.js. There's no createNotification() export
// anymore — notifications are only ever created server-side as a side effect of
// verification decisions and order create/status-change flows (see
// backend/src/lib/notify.js), never invoked directly from a client request.

// Existing call sites pass a userId argument (harmless — JS ignores extra positional
// args) — the backend always scopes the list to the authenticated caller regardless,
// never a client-supplied id.
export async function getNotificationsForUser() {
  return apiClient.get('/notifications');
}

export async function getUnreadCount() {
  const notifications = await getNotificationsForUser();
  return notifications.filter((notification) => !notification.read).length;
}

export async function markNotificationRead(id) {
  return apiClient.patch(`/notifications/${id}/read`);
}

export async function markAllNotificationsRead() {
  return apiClient.patch('/notifications/read-all');
}
