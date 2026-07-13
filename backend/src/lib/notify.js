import { supabaseAdmin } from './supabaseClient.js';

// Internal helper — not a public route. Mirrors src/services/notificationService.js's
// createNotification(), called as a side effect of verification decisions (profiles
// controller) and order create/status-change flows (orders controller), never invoked
// directly from a client request.
export async function createNotification({ userId, type, title, message, link }) {
  const { error } = await supabaseAdmin.from('notifications').insert({
    user_id: userId,
    type,
    title,
    message,
    link,
  });
  if (error) console.error('Failed to create notification:', error.message);
}
