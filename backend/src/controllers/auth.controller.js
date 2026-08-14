import { supabaseAdmin } from '../lib/supabaseClient.js';
import { serializeProfile } from '../lib/serialize.js';
import { ApiError } from '../lib/ApiError.js';
import { buildCommonFields, buildRoleFields, VALID_ROLES } from './profiles.controller.js';
import { isValidPhilippineMobile, toE164PhilippineMobile } from '../lib/philippineMobile.js';

// POST /api/auth/register — public (no session yet). Creates BOTH the Supabase Auth user
// and its profiles row in one request, using the service-role admin API rather than the
// public supabase.auth.signUp() the frontend used to call directly.
//
// email_confirm is true — accounts are instant-confirmed, no OTP verification step. OTP
// (a pending_registrations row + a 6-digit emailed code) was tried and reverted from this
// project: it made every registration depend on outbound email actually working (a Resend
// API key/domain configured correctly on the backend host), and a misconfiguration there
// hard-blocked EVERY registration with no way to recover — a single point of failure this
// project doesn't want registration to depend on.

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
  const { email: rawEmail, password, role, contactNumber: rawContactNumber } = req.body;

  if (!VALID_ROLES.includes(role)) throw new ApiError('Choose a valid account type.', 400);
  if (!password || String(password).length < 6) throw new ApiError('Enter a password with at least 6 characters.', 400);
  const email = String(rawEmail || '').trim().toLowerCase();
  if (!email) throw new ApiError('Enter your email address.', 400);

  if (!isValidPhilippineMobile(rawContactNumber)) {
    throw new ApiError('Enter a valid Philippine mobile number.', 400);
  }
  req.body.contactNumber = toE164PhilippineMobile(rawContactNumber);

  // An existing row for this email doesn't necessarily mean a real conflict — it may be an
  // abandoned signup that never finished (e.g. the browser closed mid-form on a retry). That
  // account has no way to distinguish itself from a real duplicate other than
  // email_confirmed_at, so only a CONFIRMED account blocks re-registration; an unconfirmed
  // one resumes with the newly submitted password and profile details instead.
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

  const normalizedNumber = toE164PhilippineMobile(rawContactNumber);
  const { data: existingProfileByPhone } = await supabaseAdmin.from('profiles').select('id').eq('contact_number', normalizedNumber).maybeSingle();
  if (existingProfileByPhone) {
    throw new ApiError('An account with this mobile number already exists.', 409);
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

export async function checkContactNumber(req, res) {
  const value = String(req.query.value || '');
  if (!isValidPhilippineMobile(value)) {
    return res.json({ available: false, reason: 'invalid' });
  }
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('contact_number', toE164PhilippineMobile(value))
    .maybeSingle();
  res.json({ available: !data, reason: data ? 'duplicate' : null });
}
