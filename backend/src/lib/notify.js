import { supabaseAdmin } from './supabaseClient.js';
import { sendPushToUser } from './webPushService.js';

export async function createNotification({ userId, type, title, message, link }) {
  const { data, error } = await supabaseAdmin
    .from('notifications')
    .insert({ user_id: userId, type, title, message, link })
    .select('id')
    .single();
  if (error) {
    console.error('Failed to create notification:', error.message);
    return false;
  }

  // Deliver Web Push asynchronously without blocking the primary request.
  sendPushToUser(userId, {
    id: data?.id || null,
    type,
    title,
    message,
    link,
  }).catch((pushError) => {
    console.error('Unexpected Web Push error:', pushError?.message || pushError);
  });

  return true;
}
