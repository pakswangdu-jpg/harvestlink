import * as webpush from 'web-push';
import { supabaseAdmin } from './supabaseClient.js';
import { ApiError } from './ApiError.js';

const EXPIRED_STATUS_CODES = new Set([404, 410]);
let configuredSignature = null;

function readVapidEnv(env = process.env) {
  const publicKey = String(env.VAPID_PUBLIC_KEY || '').trim();
  const privateKey = String(env.VAPID_PRIVATE_KEY || '').trim();
  const subject = String(env.VAPID_SUBJECT || '').trim();
  return { publicKey, privateKey, subject };
}

export function isWebPushConfigured(env = process.env) {
  const { publicKey, privateKey, subject } = readVapidEnv(env);
  return Boolean(publicKey && privateKey && subject);
}

export function getWebPushPublicConfig(env = process.env) {
  const { publicKey, privateKey, subject } = readVapidEnv(env);
  const enabled = Boolean(publicKey && privateKey && subject);
  return {
    enabled,
    publicKey: enabled ? publicKey : null,
  };
}

function ensureVapidConfigured(env = process.env) {
  const { publicKey, privateKey, subject } = readVapidEnv(env);
  if (!publicKey || !privateKey || !subject) return false;
  const signature = `${subject}|${publicKey}`;
  if (configuredSignature !== signature) {
    try {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      configuredSignature = signature;
    } catch (error) {
      console.error('Invalid VAPID configuration:', error?.message || error);
      return false;
    }
  }
  return true;
}

export function validatePushSubscription(input) {
  if (!input || typeof input !== 'object') {
    throw new ApiError('Push subscription payload is required.', 400);
  }
  const endpoint = String(input.endpoint || '').trim();
  const p256dh = String(input.keys?.p256dh || '').trim();
  const auth = String(input.keys?.auth || '').trim();

  if (!endpoint || endpoint.length > 2048) {
    throw new ApiError('A valid push subscription endpoint is required.', 400);
  }
  let parsedUrl;
  try {
    parsedUrl = new URL(endpoint);
  } catch {
    throw new ApiError('Push subscription endpoint must be a valid URL.', 400);
  }
  if (parsedUrl.protocol !== 'https:') {
    throw new ApiError('Push subscription endpoint must use HTTPS.', 400);
  }
  if (!p256dh || p256dh.length > 512 || !auth || auth.length > 512) {
    throw new ApiError('Valid push subscription encryption keys are required.', 400);
  }

  return { endpoint, p256dh, auth };
}

export function sanitizeNotificationLink(link) {
  const raw = String(link || '').trim();
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}

export async function savePushSubscription({ userId, subscription, userAgent = null }) {
  const { endpoint, p256dh, auth } = validatePushSubscription(subscription);
  const safeUserAgent = userAgent ? String(userAgent).slice(0, 300) : null;
  const now = new Date().toISOString();

  // Upserting on endpoint reassigns ownership to the active authenticated user
  // if a browser/device switches accounts without an explicit logout.
  const { data, error } = await supabaseAdmin
    .from('push_subscriptions')
    .upsert({
      user_id: userId,
      endpoint,
      p256dh,
      auth,
      user_agent: safeUserAgent,
      last_used_at: now,
    }, { onConflict: 'endpoint' })
    .select('id, endpoint, created_at, updated_at')
    .single();

  if (error) throw new ApiError(error.message, 400);
  return data;
}

export async function removePushSubscription({ userId, endpoint }) {
  const trimmed = String(endpoint || '').trim();
  if (!trimmed) throw new ApiError('Push subscription endpoint is required.', 400);

  const { error } = await supabaseAdmin
    .from('push_subscriptions')
    .delete()
    .eq('user_id', userId)
    .eq('endpoint', trimmed);

  if (error) throw new ApiError(error.message, 400);
}

export async function listUserPushSubscriptions(userId) {
  const { data, error } = await supabaseAdmin
    .from('push_subscriptions')
    .select('id, endpoint, updated_at, last_used_at')
    .eq('user_id', userId);
  if (error) throw new ApiError(error.message, 400);
  const rows = data || [];
  return {
    count: rows.length,
    endpoints: rows.map((row) => row.endpoint),
  };
}

export async function sendPushToUser(userId, {
  id = null,
  type = 'general',
  title = 'HarvestLink',
  message = '',
  link = '/',
  tag = null,
} = {}, { sender = webpush.sendNotification.bind(webpush), env = process.env } = {}) {
  if (!userId || !ensureVapidConfigured(env)) {
    return { sent: 0, failed: 0, removedExpired: 0, totalDevices: 0, skipped: true };
  }

  const { data: subscriptions, error } = await supabaseAdmin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId);

  if (error) {
    console.error('Failed to load push subscriptions:', error.message);
    return { sent: 0, failed: 0, removedExpired: 0, totalDevices: 0 };
  }

  const devices = subscriptions || [];
  if (!devices.length) {
    return { sent: 0, failed: 0, removedExpired: 0, totalDevices: 0 };
  }

  const notificationTag = tag || (id ? `harvestlink-notification-${id}` : `harvestlink-${type}-${Date.now()}`);
  const payload = JSON.stringify({
    id,
    type,
    title: String(title || 'HarvestLink').slice(0, 120),
    message: String(message || '').slice(0, 300),
    link: sanitizeNotificationLink(link),
    tag: notificationTag,
    timestamp: Date.now(),
  });

  const expiredIds = [];
  let sent = 0;
  let failed = 0;

  await Promise.allSettled(devices.map(async (device) => {
    try {
      await sender(
        {
          endpoint: device.endpoint,
          keys: { p256dh: device.p256dh, auth: device.auth },
        },
        payload,
        { TTL: 86400 },
      );
      sent += 1;
    } catch (pushError) {
      failed += 1;
      const statusCode = Number(pushError?.statusCode);
      if (EXPIRED_STATUS_CODES.has(statusCode)) {
        expiredIds.push(device.id);
      } else {
        console.error('Web Push delivery failed:', pushError?.message || statusCode || 'unknown error');
      }
    }
  }));

  if (expiredIds.length) {
    const { error: cleanupError } = await supabaseAdmin
      .from('push_subscriptions')
      .delete()
      .in('id', expiredIds);
    if (cleanupError) {
      console.error('Failed to prune expired push subscriptions:', cleanupError.message);
    }
  }

  return {
    sent,
    failed,
    removedExpired: expiredIds.length,
    totalDevices: devices.length,
  };
}
