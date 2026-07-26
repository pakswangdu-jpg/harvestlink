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

export async function deleteNotification(id) {
  return apiClient.delete(`/notifications/${id}`);
}

// Same snake_case-row -> camelCase mapping convention as orderService.js's
// mapOrderRealtimeRow — Supabase Realtime delivers the raw Postgres row, not a
// backend-serialized response, so this is the one place a notification's shape gets
// translated for a payload that didn't come through the REST API (see
// src/hooks/useNotificationsRealtime.js).
export function mapNotificationRealtimeRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    title: row.title,
    message: row.message,
    link: row.link,
    read: row.read,
    createdAt: row.created_at,
  };
}
