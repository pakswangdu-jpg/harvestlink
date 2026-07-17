import { supabaseAdmin } from '../lib/supabaseClient.js';
import { serializeProfile } from '../lib/serialize.js';
import { createNotification } from '../lib/notify.js';
import { ApiError } from '../lib/ApiError.js';

export const VALID_ROLES = ['farmer', 'buyer', 'stakeholder'];

// Editable fields shared by every role, common to both create and self-edit payloads.
export function buildCommonFields(values) {
  const firstName = String(values.firstName || '').trim();
  const middleName = String(values.middleName || '').trim();
  const lastName = String(values.lastName || '').trim();
  return {
    first_name: firstName,
    middle_name: middleName,
    last_name: lastName,
    name: values.name?.trim() || [firstName, middleName, lastName].filter(Boolean).join(' '),
    address: values.address?.trim() || '',
    zip_code: values.zipCode?.trim() || '',
    municipality: values.municipality,
  };
}

// Role-specific fields — `role` is always passed explicitly by the caller (from
// values.role on create, from the caller's own known req.profile.role on self-edit),
// never guessed from which fields happen to be present in the request body.
//
// The file-URL fields (accreditation_file_url / gov_id_file_url) are set whenever the
// caller actually included that key in the payload — not gated to isCreate — because
// registration now uploads the file (to Storage, from the browser) in a separate step
// *after* the account exists, then PATCHes the resulting URL in via updateMyProfile.
// Profile.jsx's own self-edit form never sends these keys, so this doesn't change
// anything for that existing path.
export function buildRoleFields(role, values, { isCreate }) {
  if (role === 'stakeholder') {
    return {
      organization_name: values.organizationName?.trim(),
      organization_type: values.organizationType,
      contact_person: values.contactPerson?.trim(),
      contact_number: values.contactNumber?.trim() || '',
      ...(values.accreditationFile !== undefined ? { accreditation_file_url: values.accreditationFile || null } : {}),
    };
  }
  if (role === 'farmer') {
    return {
      birthday: values.birthday || null,
      farm_name: values.farmName?.trim(),
      contact_number: values.contactNumber?.trim() || '',
      ...(values.govIdFile !== undefined ? { gov_id_file_url: values.govIdFile || null } : {}),
      ...(isCreate ? { verification_status: 'pending', verification_acknowledged: true } : {}),
    };
  }
  if (role === 'buyer') {
    return { contact_number: values.contactNumber?.trim() || '' };
  }
  return {};
}

// POST /api/profiles — creates the profiles row right after Supabase auth.signUp().
// id/email are NEVER taken from the request body — only from the verified auth token —
// so a client can't create a profile for someone else's account.
export async function createProfile(req, res) {
  const { role } = req.body;
  if (!VALID_ROLES.includes(role)) throw new ApiError('Choose a valid account type.', 400);

  const row = {
    id: req.authUser.id,
    email: req.authUser.email,
    role,
    ...buildCommonFields(req.body),
    ...buildRoleFields(role, req.body, { isCreate: true }),
  };
  const { data, error } = await supabaseAdmin.from('profiles').insert(row).select().single();
  if (error) {
    if (error.code === '23505') throw new ApiError('An account with this email already exists.', 409);
    throw new ApiError(error.message, 400);
  }
  res.status(201).json(serializeProfile(data));
}

export async function getMyProfile(req, res) {
  res.json(serializeProfile(req.profile));
}

export async function updateMyProfile(req, res) {
  const row = {
    ...buildCommonFields(req.body),
    ...buildRoleFields(req.profile.role, req.body, { isCreate: false }),
  };
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update(row)
    .eq('id', req.profile.id)
    .select()
    .single();
  if (error) throw new ApiError(error.message, 400);
  res.json(serializeProfile(data));
}

export async function acknowledgeMyVerification(req, res) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update({ verification_acknowledged: true })
    .eq('id', req.profile.id)
    .select()
    .single();
  if (error) throw new ApiError(error.message, 400);
  res.json(serializeProfile(data));
}

export async function getProfileById(req, res) {
  const { data, error } = await supabaseAdmin.from('profiles').select('*').eq('id', req.params.id).single();
  if (error || !data) throw new ApiError('Account was not found.', 404);
  res.json(serializeProfile(data));
}

// GET /api/profiles?role=&verificationStatus=&accountStatus= — non-admin callers are
// server-forced to safe filters (never see suspended accounts or a farmer's pending/
// rejected verification state) regardless of what query params they pass; only an
// admin caller gets the raw, unfiltered query — mirrors getUsers()/getVerifiedFarmers()/
// getBuyers()/getStakeholders() all being safe-by-construction on the old service layer.
export async function listProfiles(req, res) {
  const isAdmin = req.profile.role === 'admin';
  let query = supabaseAdmin.from('profiles').select('*');

  if (req.query.role) query = query.eq('role', req.query.role);

  if (isAdmin) {
    if (req.query.verificationStatus) query = query.eq('verification_status', req.query.verificationStatus);
    if (req.query.accountStatus) query = query.eq('account_status', req.query.accountStatus);
  } else {
    query = query.neq('account_status', 'suspended');
    if (req.query.role === 'farmer') query = query.eq('verification_status', 'verified');
  }

  const { data, error } = await query;
  if (error) throw new ApiError(error.message, 400);

  const serialized = data.map(serializeProfile);
  // A farmer's average rating is computed fresh on every read (never stored) so it can
  // never drift stale — cheap here since it's one extra query per list call, not per farmer.
  const farmerIds = data.filter((row) => row.role === 'farmer').map((row) => row.id);
  if (farmerIds.length) {
    const { data: ratings } = await supabaseAdmin.from('ratings').select('farmer_id, rating').in('farmer_id', farmerIds);
    const summaryById = new Map();
    (ratings || []).forEach(({ farmer_id: farmerId, rating }) => {
      const entry = summaryById.get(farmerId) || { total: 0, count: 0 };
      entry.total += rating;
      entry.count += 1;
      summaryById.set(farmerId, entry);
    });
    serialized.forEach((profile) => {
      if (profile.role !== 'farmer') return;
      const entry = summaryById.get(profile.id);
      profile.avgRating = entry ? Number((entry.total / entry.count).toFixed(1)) : null;
      profile.ratingCount = entry ? entry.count : 0;
    });
  }

  res.json(serialized);
}

export async function setVerification(req, res) {
  const { status } = req.body;
  if (!['verified', 'rejected'].includes(status)) throw new ApiError('Invalid verification status.', 400);

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update({ verification_status: status, verified_at: new Date().toISOString(), verification_acknowledged: false })
    .eq('id', req.params.id)
    .select()
    .single();
  if (error || !data) throw new ApiError('Account was not found.', 404);

  await createNotification({
    userId: data.id,
    type: 'verification',
    title: status === 'verified' ? 'Account verified' : 'Verification declined',
    message: status === 'verified'
      ? 'Your account has been approved by admin. You can now add products to the marketplace.'
      : 'Your account verification was declined. Update your profile and contact support if you believe this was a mistake.',
    link: '/profile',
  });

  res.json(serializeProfile(data));
}

export async function setAccountStatus(req, res) {
  const { status } = req.body;
  if (!['active', 'suspended'].includes(status)) throw new ApiError('Invalid account status.', 400);

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update({ account_status: status })
    .eq('id', req.params.id)
    .select()
    .single();
  if (error || !data) throw new ApiError('Account was not found.', 404);
  res.json(serializeProfile(data));
}

// Admin-only signed-URL access to another user's private gov ID / accreditation file —
// the storage bucket policy itself is owner-only, so this is the one deliberate,
// service-role-mediated exception (see supabase/schema.sql's storage policy comments).
export async function getVerificationDocuments(req, res) {
  const { data: profile, error } = await supabaseAdmin.from('profiles').select('*').eq('id', req.params.id).single();
  if (error || !profile) throw new ApiError('Account was not found.', 404);

  // gov_id_file_url / accreditation_file_url store the bucket-relative PATH (not a URL) —
  // verification-documents is a private bucket with no directly-fetchable public URL, so
  // uploadService.js on the frontend stores the raw path and this is the one place
  // (admin-only, service-role-mediated) that turns it into a short-lived signed URL.
  const paths = { govIdFile: profile.gov_id_file_url, accreditationFile: profile.accreditation_file_url };
  const signedUrls = {};
  for (const [key, path] of Object.entries(paths)) {
    if (!path) continue;
    const { data: signed } = await supabaseAdmin.storage.from('verification-documents').createSignedUrl(path, 60);
    if (signed) signedUrls[key] = signed.signedUrl;
  }
  res.json(signedUrls);
}
