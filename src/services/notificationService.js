import { apiClient } from './apiClient';










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
