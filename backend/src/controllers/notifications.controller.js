import { supabaseAdmin } from '../lib/supabaseClient.js';
import { serializeNotification } from '../lib/serialize.js';
import { ApiError } from '../lib/ApiError.js';
import {
  getWebPushPublicConfig,
  listUserPushSubscriptions,
  removePushSubscription,
  savePushSubscription,
  sendPushToUser,
} from '../lib/webPushService.js';




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

export async function deleteNotification(req, res) {
  const { data: existing } = await supabaseAdmin.from('notifications').select('*').eq('id', req.params.id).single();
  if (!existing) throw new ApiError('Notification was not found.', 404);
  if (existing.user_id !== req.profile.id) throw new ApiError('You do not have permission to modify this notification.', 403);

  const { error } = await supabaseAdmin.from('notifications').delete().eq('id', req.params.id);
  if (error) throw new ApiError(error.message, 400);
  res.status(204).end();
}

export async function getPushConfig(req, res) {
  res.json(getWebPushPublicConfig());
}

export async function getMyPushSubscriptions(req, res) {
  const result = await listUserPushSubscriptions(req.profile.id);
  res.json(result);
}

export async function subscribePush(req, res) {
  const subscription = req.body?.subscription || req.body;
  const saved = await savePushSubscription({
    userId: req.profile.id,
    subscription,
    userAgent: req.headers['user-agent'] || null,
  });
  res.status(201).json({ subscribed: true, id: saved.id, endpoint: saved.endpoint });
}

export async function unsubscribePush(req, res) {
  const endpoint = req.body?.endpoint || req.query?.endpoint;
  await removePushSubscription({ userId: req.profile.id, endpoint });
  res.status(204).end();
}

export async function sendTestPush(req, res) {
  const config = getWebPushPublicConfig();
  if (!config.enabled) {
    throw new ApiError('Web Push is not configured on the server.', 503);
  }
  const roleLink = req.profile.role === 'admin'
    ? '/admin/overview'
    : req.profile.role === 'farmer'
      ? '/farmer-dashboard'
      : req.profile.role === 'stakeholder'
        ? '/stakeholder-dashboard'
        : '/marketplace';

  const result = await sendPushToUser(req.profile.id, {
    type: 'test',
    title: 'HarvestLink Test Notification',
    message: 'Push notifications are active on this device.',
    link: roleLink,
    tag: `harvestlink-test-${req.profile.id}`,
  });

  if (result.totalDevices === 0) {
    throw new ApiError('No active push subscription found for your account on this device.', 404);
  }

  res.json(result);
}
