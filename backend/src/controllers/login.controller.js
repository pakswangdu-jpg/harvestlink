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
    throw new ApiError('Sign-in is temporarily unavailable. Please try again later.', 503);
  }

  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  let result;
  try {
    result = await authClient.auth.signInWithPassword({ email, password });
  } catch {
    throw new ApiError('Sign-in is temporarily unavailable. Please try again later.', 503);
  }
  const { data, error } = result;
  if (error) {
    if (error.message?.toLowerCase().includes('email not confirmed')) {
      throw loginError('Email not confirmed', 401, 'email_not_confirmed');
    }
    throw loginError('Invalid email or password.', 401, 'INVALID_CREDENTIALS');
  }

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
    throw new ApiError('Unable to verify this account. Please try again.', 401);
  }

  await assertAccountActive(profile);
  if (req.adminLogin && profile.role !== 'admin') {
    throw new ApiError('Admin sign-in is restricted to active administrator accounts.', 403);
  }

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
