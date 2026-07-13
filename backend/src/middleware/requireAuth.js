import { supabaseAdmin } from '../lib/supabaseClient.js';
import { ApiError } from '../lib/ApiError.js';

// Verifies the Supabase-issued access token the frontend sends as a Bearer header,
// then loads the matching profiles row and attaches both to the request. Uses
// supabase.auth.getUser(token) (a call to Supabase's own Auth server) rather than
// manual JWKS/jsonwebtoken verification — one documented call, no key-rotation
// handling needed on our side.
export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new ApiError('Missing bearer token.', 401);

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

    touchLastActive(profile);

    req.authUser = data.user;
    req.profile = profile;
    next();
  } catch (error) {
    next(error);
  }
}

// Fed every authenticated request, but only actually writes to the DB at most once a
// minute per account — cheap presence tracking (used for an Online/Offline indicator on
// the Farmer Map) without turning every API call into an extra write. Fire-and-forget:
// never awaited, so a slow/failed presence update can't add latency to the real request or
// take it down. Mutates `profile` in place so the CURRENT request's response (e.g.
// /profiles/me) already reflects the fresh timestamp instead of lagging one request behind.
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
