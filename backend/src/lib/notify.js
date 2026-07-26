import { supabaseAdmin } from './supabaseClient.js';

// Internal helper — not a public route. Mirrors src/services/notificationService.js's
// getNotificationsForUser() on the read side, called as a side effect of order/payment/
// message/verification events across the other controllers, never invoked directly from a
// client request.
export async function createNotification({ userId, type, title, message, link }) {
  const { error } = await supabaseAdmin
    .from('notifications')
    .insert({ user_id: userId, type, title, message, link });
  if (error) {
    console.error('Failed to create notification:', error.message);
  }
}
