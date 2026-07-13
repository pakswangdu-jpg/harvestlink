import { supabaseAdmin } from '../lib/supabaseClient.js';
import { serializeProfile } from '../lib/serialize.js';
import { ApiError } from '../lib/ApiError.js';
import { buildCommonFields, buildRoleFields, VALID_ROLES } from './profiles.controller.js';

// POST /api/auth/register — public (no session yet). Creates BOTH the Supabase Auth user
// and its profiles row in one request, using the service-role admin API rather than the
// public supabase.auth.signUp() the frontend used to call directly.
//
// Why: signUp() sends a confirmation email on every call whenever "Confirm email" is on
// for the project, and Supabase's default (non-custom-SMTP) email sending is capped at a
// couple of emails per hour — a handful of test registrations exhausts it and every
// registration fails with "email rate limit exceeded" until the window clears. The admin
// API (auth.admin.createUser with email_confirm: true) creates an already-confirmed user
// without sending anything at all, so it's never subject to that limit — matching this
// app's actual design anyway (register and be logged in immediately, no email step).
export async function register(req, res) {
  const { email: rawEmail, password, role } = req.body;

  if (!VALID_ROLES.includes(role)) throw new ApiError('Choose a valid account type.', 400);
  if (!password || String(password).length < 6) throw new ApiError('Enter a password with at least 6 characters.', 400);
  const email = String(rawEmail || '').trim().toLowerCase();
  if (!email) throw new ApiError('Enter your email address.', 400);

  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError) {
    if (createError.status === 422 || createError.message.toLowerCase().includes('already been registered')) {
      throw new ApiError('An account with this email already exists.', 409);
    }
    throw new ApiError(createError.message, 400);
  }

  const row = {
    id: created.user.id,
    email,
    role,
    ...buildCommonFields(req.body),
    ...buildRoleFields(role, req.body, { isCreate: true }),
  };
  const { data: profile, error: profileError } = await supabaseAdmin.from('profiles').insert(row).select().single();
  if (profileError) {
    // Roll back the auth user — otherwise a failed profile insert leaves an orphaned,
    // pre-confirmed auth account with no profile, which then permanently blocks this
    // email from ever registering again (Supabase would say "already registered") while
    // never having a usable account.
    await supabaseAdmin.auth.admin.deleteUser(created.user.id);
    if (profileError.code === '23505') throw new ApiError('An account with this email already exists.', 409);
    throw new ApiError(profileError.message, 400);
  }

  res.status(201).json(serializeProfile(profile));
}
