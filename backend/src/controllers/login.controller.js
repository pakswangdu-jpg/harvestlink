import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../lib/supabaseClient.js';
import { ApiError } from '../lib/ApiError.js';
import { assertAccountActive } from '../lib/accountInactivity.js';
import { verifyRecaptchaToken } from '../lib/recaptcha.js';

function loginError(message, status, code) {
  const error = new ApiError(message, status);
  if (code) error.code = code;
  return error;
}

export async function login(req, res) {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = req.body?.password;
  if (!email || typeof password !== 'string' || !password) {
    throw new ApiError('Enter your email address and password.', 400);
  }

  await verifyRecaptchaToken(req.body?.captchaToken);

  const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw loginError('Sign-in is temporarily unavailable. Please try again later.', 503, 'AUTH_SERVICE_UNAVAILABLE');
  }

  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  let result;
  try {
    result = await authClient.auth.signInWithPassword({ email, password });
  } catch {
    throw loginError('Sign-in is temporarily unavailable. Please try again later.', 503, 'AUTH_SERVICE_UNAVAILABLE');
  }
  const { data, error } = result;
  if (error) {
    if (error.message?.toLowerCase().includes('email not confirmed')) {
      throw loginError('Email not confirmed', 401, 'email_not_confirmed');
    }
    if (error.status >= 500 || error.status === 429) {
      throw loginError('Sign-in is temporarily unavailable. Please try again later.', 503, 'AUTH_SERVICE_UNAVAILABLE');
    }
    req.loginOutcome = 'invalid-credentials';
    throw loginError('Invalid email or password.', 401, 'INVALID_CREDENTIALS');
  }

  req.loginOutcome = 'authenticated';
  const session = data?.session;
  const userId = data?.user?.id || session?.user?.id;
  if (!session?.access_token || !session.refresh_token || !userId) {
    throw new ApiError('Unable to complete sign-in. Please try again.', 401);
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id, role, account_status, inactivity_suspended_at, last_active_at, created_at')
    .eq('id', userId)
    .maybeSingle();
  if (profileError || !profile) {
    throw loginError('Unable to verify this account. Please try again.', profileError ? 503 : 403,
      profileError ? 'AUTH_SERVICE_UNAVAILABLE' : 'ACCOUNT_UNAVAILABLE');
  }

  if (profile.account_status === 'suspended' && !profile.inactivity_suspended_at) {
    const { data: deactivation, error: deactivationError } = await supabaseAdmin
      .from('account_admin_events')
      .select('action,reason')
      .eq('user_id', profile.id)
      .in('action', ['USER_DEACTIVATED', 'USER_AUTO_DEACTIVATED'])
      .order('occurred_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (deactivationError) {
      throw loginError('Unable to retrieve account deactivation details. Please try again later.', 503, 'AUTH_SERVICE_UNAVAILABLE');
    }
    const reason = deactivation?.reason?.trim();
    const automatic = deactivation?.action === 'USER_AUTO_DEACTIVATED';
    const message = automatic
      ? `Your account was automatically deactivated because a product listing contained marijuana/cannabis-related terms prohibited by HarvestLink policy.${reason ? ` Reason: ${reason}.` : ''} Contact HarvestLink support if you think this is a mistake.`
      : reason
        ? `Your account was deactivated by an administrator. Reason: ${reason}. Contact HarvestLink support if you think this is a mistake.`
        : 'Your account was deactivated by an administrator. No reason was recorded. Contact the HarvestLink administrator for help.';
    throw loginError(message, 403, 'ACCOUNT_DEACTIVATED');
  }

  await assertAccountActive(profile);
  if (req.adminLogin && profile.role !== 'admin') {
    throw loginError('Admin sign-in is restricted to active administrator accounts.', 403, 'ADMIN_ONLY');
  }

  console.info(JSON.stringify({ timestamp: new Date().toISOString(), event: 'LOGIN_SUCCESS', path: req.path }));
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    session: {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    },
  });
}

export function adminLogin(req, res) {
  req.adminLogin = true;
  return login(req, res);
}
