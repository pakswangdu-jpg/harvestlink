import { createHash } from 'node:crypto';
import { supabaseAdmin } from '../lib/supabaseClient.js';
import { ApiError } from '../lib/ApiError.js';
import { requireAdminNetwork } from './requireAdminNetwork.js';

const AUTH_CACHE_TTL_MS = 10 * 1000;
const AUTH_CACHE_LIMIT = 500;
const authCache = new Map();
const pendingAuth = new Map();

function tokenKey(token) {
  return createHash('sha256').update(token).digest('base64url');
}

function setCachedAuth(key, value) {
  if (authCache.size >= AUTH_CACHE_LIMIT) authCache.delete(authCache.keys().next().value);
  authCache.set(key, { value, expiresAt: Date.now() + AUTH_CACHE_TTL_MS });
}

export function invalidateAuthCacheForUser(userId) {
  for (const [key, cached] of authCache) {
    if (cached.value.profile.id === userId) authCache.delete(key);
  }
}

async function loadAuth(token) {
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) throw new ApiError('Invalid or expired session.', 401);

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', data.user.id)
    .single();
  if (profileError || !profile) throw new ApiError('No profile found for this account.', 401);
  if (profile.account_status === 'suspended') {
    throw new ApiError('This account has been suspended. Contact support for assistance.', 403);
  }

  return { user: data.user, profile };
}

async function resolveAuth(token) {
  const key = tokenKey(token);
  const cached = authCache.get(key);
  if (cached?.expiresAt > Date.now()) return cached.value;
  if (cached) authCache.delete(key);
  if (pendingAuth.has(key)) return pendingAuth.get(key);

  const request = loadAuth(token)
    .then((value) => {
      setCachedAuth(key, value);
      return value;
    })
    .finally(() => pendingAuth.delete(key));
  pendingAuth.set(key, request);
  return request;
}






export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new ApiError('Missing bearer token.', 401);

    const { user, profile } = await resolveAuth(token);

    req.authUser = user;
    req.profile = { ...profile };
    // Only the caller's own profile is available before the Admin network gate.
    const ownProfileBootstrap = req.method === 'GET' && req.originalUrl?.split('?')[0] === '/api/profiles/me';
    if (ownProfileBootstrap) {
      if (profile.role !== 'admin') touchLastActive(profile);
      return next();
    }
    requireAdminNetwork(req, res, (error) => {
      if (error) return next(error);
      touchLastActive(profile);
      next();
    });
  } catch (error) {
    next(error);
  }
}







const PRESENCE_THROTTLE_MS = 55 * 1000;
function touchLastActive(profile) {
  const lastActiveMs = profile.last_active_at ? new Date(profile.last_active_at).getTime() : 0;
  if (Date.now() - lastActiveMs < PRESENCE_THROTTLE_MS) return;

  const now = new Date().toISOString();
  profile.last_active_at = now;
  supabaseAdmin
    .from('profiles')
    .update({ last_active_at: now })
    .eq('id', profile.id)
    .then(({ error }) => {
      if (error) console.error('Failed to update last_active_at:', error.message);
    });
}
