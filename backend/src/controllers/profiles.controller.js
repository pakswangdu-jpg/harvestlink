import { supabaseAdmin } from '../lib/supabaseClient.js';
import { serializeProfile } from '../lib/serialize.js';
import { createNotification } from '../lib/notify.js';
import { ApiError } from '../lib/ApiError.js';

export const VALID_ROLES = ['farmer', 'buyer', 'stakeholder'];

// Editable fields shared by every role, common to both create and self-edit payloads.
//
// Every field is only set when the caller actually included its key — registration and
// the full profile-edit form always send every key (even as '' when blank), so this is a
// no-op change for them. It matters for callers that PATCH a single field (e.g. Profile.jsx's
// avatar upload only sends { avatarUrl }): without this guard, the missing keys would fall
// through to their '' / null defaults below and silently blank out the user's name/address/
// zip on every avatar change.
export function buildCommonFields(values) {
  const fields = {};

  // first/middle/last/name always travel together as one edit.
  if (
    values.firstName !== undefined ||
    values.middleName !== undefined ||
    values.lastName !== undefined ||
    values.name !== undefined
  ) {
    const firstName = String(values.firstName || '').trim();
    const middleName = String(values.middleName || '').trim();
    const lastName = String(values.lastName || '').trim();
    fields.first_name = firstName;
    fields.middle_name = middleName;
    fields.last_name = lastName;
    fields.name = values.name?.trim() || [firstName, middleName, lastName].filter(Boolean).join(' ');
  }
  if (values.address !== undefined) fields.address = values.address?.trim() || '';
  if (values.zipCode !== undefined) fields.zip_code = values.zipCode?.trim() || '';
  if (values.municipality !== undefined) fields.municipality = values.municipality;
  // Same pattern as gov_id_file_url/accreditation_file_url below: the picture is uploaded
  // to Storage from the browser first (see uploadService.js), then the resulting public
  // URL is PATCHed in here.
  if (values.avatarUrl !== undefined) fields.avatar_url = values.avatarUrl || null;

  return fields;
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
  // Same "only set when the key is present" guard as buildCommonFields above — contact_number
  // and birthday used `|| ''` / `|| null` fallbacks, which would silently wipe them on any
  // partial-payload PATCH (e.g. an avatar-only update) if left unconditional.
  if (role === 'stakeholder') {
    const fields = {};
    if (values.organizationName !== undefined) fields.organization_name = values.organizationName?.trim();
    if (values.organizationType !== undefined) fields.organization_type = values.organizationType;
    if (values.contactPerson !== undefined) fields.contact_person = values.contactPerson?.trim();
    if (values.contactNumber !== undefined) fields.contact_number = values.contactNumber?.trim() || '';
    if (values.accreditationFile !== undefined) fields.accreditation_file_url = values.accreditationFile || null;
    return fields;
  }
  if (role === 'farmer') {
    const fields = {};
    if (values.birthday !== undefined) fields.birthday = values.birthday || null;
    if (values.farmName !== undefined) fields.farm_name = values.farmName?.trim();
    if (values.contactNumber !== undefined) fields.contact_number = values.contactNumber?.trim() || '';
    if (values.govIdFile !== undefined) fields.gov_id_file_url = values.govIdFile || null;
    if (isCreate) {
      fields.verification_status = 'pending';
      fields.verification_acknowledged = true;
    }
    return fields;
  }
  if (role === 'buyer') {
    const fields = {};
    if (values.contactNumber !== undefined) fields.contact_number = values.contactNumber?.trim() || '';
    return fields;
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

// GET /api/profiles/top-farmers — public, no auth (used by the logged-out landing page to
// show off verified 5-star farmers). Deliberately hand-picks a public-safe field list here
// instead of reusing serializeProfile — a signed-out visitor must never see a farmer's
// email, contact number, address, or gov ID file, only what a buyer would want to browse.
export async function getTopRatedFarmers(req, res) {
  const { data: farmers, error } = await supabaseAdmin
    .from('profiles')
    .select('id, name, farm_name, municipality, avatar_url')
    .eq('role', 'farmer')
    .eq('verification_status', 'verified')
    .neq('account_status', 'suspended');
  if (error) throw new ApiError(error.message, 400);
  if (!farmers.length) return res.json([]);

  const { data: ratings, error: ratingsError } = await supabaseAdmin
    .from('ratings')
    .select('farmer_id, rating')
    .in('farmer_id', farmers.map((farmer) => farmer.id));
  if (ratingsError) throw new ApiError(ratingsError.message, 400);

  const summaryById = new Map();
  (ratings || []).forEach(({ farmer_id: farmerId, rating }) => {
    const entry = summaryById.get(farmerId) || { total: 0, count: 0 };
    entry.total += rating;
    entry.count += 1;
    summaryById.set(farmerId, entry);
  });

  const topFarmers = farmers
    .map((farmer) => {
      const entry = summaryById.get(farmer.id);
      return {
        id: farmer.id,
        name: farmer.name,
        farmName: farmer.farm_name,
        municipality: farmer.municipality,
        avatarUrl: farmer.avatar_url || null,
        avgRating: entry ? entry.total / entry.count : 0,
        ratingCount: entry ? entry.count : 0,
      };
    })
    // A perfect, unrounded 5.0 average — not "rounds to 5" — AND at least 5 ratings behind
    // it, so a single lucky review can't land a farmer in the showcase.
    .filter((farmer) => farmer.ratingCount >= 5 && farmer.avgRating === 5)
    .sort((a, b) => b.ratingCount - a.ratingCount)
    .slice(0, 8);

  res.json(topFarmers);
}

// GET /api/profiles/:id/public — public, no auth. Backs the "view farmer" page a signed-out
// visitor reaches by clicking a card in the landing page's 5-star showcase. Same public-safe
// field list as getTopRatedFarmers, for one arbitrary id instead of the top 8 — and 404s
// (rather than exposing anything) for a farmer that isn't verified/active, the same
// visibility rule listProfiles already applies for non-admin callers, so this can never be
// used to probe for a pending/rejected/suspended account's existence.
export async function getPublicFarmerProfile(req, res) {
  const { data: farmer, error } = await supabaseAdmin
    .from('profiles')
    .select('id, name, farm_name, municipality, avatar_url, role, verification_status, account_status')
    .eq('id', req.params.id)
    .single();
  if (
    error || !farmer
    || farmer.role !== 'farmer'
    || farmer.verification_status !== 'verified'
    || farmer.account_status === 'suspended'
  ) {
    throw new ApiError('Farmer was not found.', 404);
  }

  const { data: ratings } = await supabaseAdmin.from('ratings').select('rating').eq('farmer_id', farmer.id);
  const ratingCount = ratings?.length || 0;
  const avgRating = ratingCount ? ratings.reduce((sum, entry) => sum + entry.rating, 0) / ratingCount : 0;

  res.json({
    id: farmer.id,
    name: farmer.name,
    farmName: farmer.farm_name,
    municipality: farmer.municipality,
    avatarUrl: farmer.avatar_url || null,
    avgRating,
    ratingCount,
  });
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
