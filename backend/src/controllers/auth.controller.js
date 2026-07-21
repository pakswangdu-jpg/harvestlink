import { supabaseAdmin } from '../lib/supabaseClient.js';
import { serializeProfile } from '../lib/serialize.js';
import { ApiError } from '../lib/ApiError.js';
import { buildCommonFields, buildRoleFields, VALID_ROLES } from './profiles.controller.js';

// POST /api/auth/register — public (no session yet). Creates BOTH the Supabase Auth user
// and its profiles row in one request, using the service-role admin API rather than the
// public supabase.auth.signUp() the frontend used to call directly.
//
// email_confirm is true — accounts are instant-confirmed, no OTP verification step. OTP
// (email_confirm: false + registerUser/verifyRegistrationOtp in authService.js) was tried
// and reverted twice this project: it re-enables Supabase's ~2-emails/hour default sending
// cap, which kept locking real users out mid-registration. Configuring custom SMTP in the
// Supabase dashboard would remove that cap if OTP is ever turned back on.

// Fields specific to one role only — reset to a clean slate before applying whichever
// role's own fields the reused-signup branch below is about to write, so switching role
// on a retry (e.g. registered as "farmer" the first time, retrying as "buyer") can't leave
// stale fields (farm_name, verification_status, ...) behind from the abandoned attempt.
const ROLE_SPECIFIC_FIELD_RESET = {
  organization_name: null,
  organization_type: null,
  contact_person: null,
  accreditation_file_url: null,
  birthday: null,
  farm_name: null,
  gov_id_file_url: null,
  verification_status: null,
  verification_acknowledged: false,
};

export async function register(req, res) {
  const { email: rawEmail, password, role } = req.body;

  if (!VALID_ROLES.includes(role)) throw new ApiError('Choose a valid account type.', 400);
  if (!password || String(password).length < 6) throw new ApiError('Enter a password with at least 6 characters.', 400);
  const email = String(rawEmail || '').trim().toLowerCase();
  if (!email) throw new ApiError('Enter your email address.', 400);

  // An existing row for this email doesn't necessarily mean a real conflict — it may be an
  // abandoned signup that never finished email verification (OTP never arrived, e.g.
  // Supabase's rate-limit cap, or the user simply navigated away). That account has no
  // password anyone could have confirmed and no way to ever sign in, so re-registering with
  // the same email should resume it — new password, fresh profile details, new OTP — rather
  // than permanently locking the email out. A CONFIRMED account is a real duplicate and
  // still gets blocked below.
  const { data: existingProfile } = await supabaseAdmin.from('profiles').select('id').eq('email', email).maybeSingle();
  if (existingProfile) {
    const { data: existingUser } = await supabaseAdmin.auth.admin.getUserById(existingProfile.id);
    if (existingUser?.user && !existingUser.user.email_confirmed_at) {
      const { error: updatePasswordError } = await supabaseAdmin.auth.admin.updateUserById(existingProfile.id, { password });
      if (updatePasswordError) throw new ApiError(updatePasswordError.message, 400);

      const row = {
        role,
        ...ROLE_SPECIFIC_FIELD_RESET,
        ...buildCommonFields(req.body),
        ...buildRoleFields(role, req.body, { isCreate: true }),
      };
      const { data: profile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .update(row)
        .eq('id', existingProfile.id)
        .select()
        .single();
      if (profileError) throw new ApiError(profileError.message, 400);

      return res.status(201).json(serializeProfile(profile));
    }
    throw new ApiError('An account with this email already exists.', 409);
  }

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
