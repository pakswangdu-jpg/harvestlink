import { supabaseAdmin } from '../lib/supabaseClient.js';
import { serializeNotification } from '../lib/serialize.js';
import { ApiError } from '../lib/ApiError.js';

// Always scoped to the authenticated caller — there's no public POST route,
// notifications are only ever created as a side effect of other controllers
// (see lib/notify.js), never invoked directly from a client request.
export async function listMyNotifications(req, res) {
  const { data, error } = await supabaseAdmin
    .from('notifications')
    .select('*')
    .eq('user_id', req.profile.id)
    .order('created_at', { ascending: false });
  if (error) throw new ApiError(error.message, 400);
  res.json(data.map(serializeNotification));
}

export async function markRead(req, res) {
  const { data: existing } = await supabaseAdmin.from('notifications').select('*').eq('id', req.params.id).single();
  if (!existing) throw new ApiError('Notification was not found.', 404);
  if (existing.user_id !== req.profile.id) throw new ApiError('You do not have permission to modify this notification.', 403);

  const { data, error } = await supabaseAdmin
    .from('notifications')
    .update({ read: true })
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) throw new ApiError(error.message, 400);
  res.json(serializeNotification(data));
}

export async function markAllRead(req, res) {
  const { error } = await supabaseAdmin
    .from('notifications')
    .update({ read: true })
    .eq('user_id', req.profile.id)
    .eq('read', false);
  if (error) throw new ApiError(error.message, 400);
  res.status(204).end();
}
