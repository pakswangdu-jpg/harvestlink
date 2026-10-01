import { supabaseAdmin } from './supabaseClient.js';





export async function createNotification({ userId, type, title, message, link }) {
  const { error } = await supabaseAdmin
    .from('notifications')
    .insert({ user_id: userId, type, title, message, link });
  if (error) {
    console.error('Failed to create notification:', error.message);
  }
}
