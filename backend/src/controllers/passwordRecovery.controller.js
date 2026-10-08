import { supabaseAdmin } from '../lib/supabaseClient.js';
import { sendPasswordResetEmail } from '../lib/email.js';
import { ApiError } from '../lib/ApiError.js';
import { getAllowedOrigins, getAppUrl } from '../lib/appUrls.js';

function recoveryRedirect(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new ApiError('The password reset address is invalid. Please reload this page.', 400);
  }
  const origins = getAllowedOrigins();
  const allowed = origins.some((origin) => {
    const pattern = origin.trim().replace(/\/+$/, '').toLowerCase();
    if (!pattern) return false;
    const source = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp(`^${source}$`).test(url.origin.toLowerCase());
  });
  if (!allowed || !['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
    throw new ApiError('The password reset address is not allowed.', 400);
  }
  const isLocal = ['localhost', '127.0.0.1'].includes(url.hostname);
  return new URL('/reset-password', isLocal ? url.origin : getAppUrl()).toString();
}

export async function requestPasswordReset(req, res) {
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiError('Please enter a valid email address.', 400);
  }
  const redirectTo = recoveryRedirect(req.body.redirectTo);
  const { data: profile, error: profileError } = await supabaseAdmin.from('profiles')
    .select('id,email').eq('email', email).maybeSingle();
  if (profileError) throw new ApiError('Unable to check your account right now. Please try again.', 503);
  if (!profile) throw new ApiError('No account exists with this email address.', 404);

  const { data: account, error: accountError } = await supabaseAdmin.auth.admin.getUserById(profile.id);
  if (accountError && accountError.status !== 404) {
    throw new ApiError('Unable to check your account right now. Please try again.', 503);
  }
  const user = account?.user;
  if (!user || user.email?.toLowerCase() !== email) {
    throw new ApiError('No account exists with this email address.', 404);
  }
  if (!user.email_confirmed_at) throw new ApiError('Please verify your email before resetting your password.', 400);

  const { data: recovery, error: recoveryError } = await supabaseAdmin.auth.admin.generateLink({
    type: 'recovery', email, options: { redirectTo },
  });
  if (recoveryError || !recovery?.properties?.hashed_token || recovery.user?.id !== user.id) {
    throw new ApiError('Unable to create a reset link right now. Please try again.', 503);
  }
  const resetLink = new URL(redirectTo);
  resetLink.searchParams.set('token_hash', recovery.properties.hashed_token);
  resetLink.searchParams.set('type', 'recovery');
  try {
    await sendPasswordResetEmail(email, resetLink.toString());
  } catch {
    throw new ApiError("We couldn't send the reset email right now. Please try again later.", 503);
  }
  res.json({ sent: true });
}
