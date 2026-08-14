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
    // Same admin review gate as farmer below — AdminUsers.jsx already has a full
    // isFarmer-or-isStakeholder verify/reject flow for the accreditation document, and the
    // registration form itself promises "will only be reviewed by the HarvestLink
    // administrator" — but nothing ever put a new stakeholder into 'pending' to review.
    if (isCreate) {
      fields.verification_status = 'pending';
      fields.verification_acknowledged = true;
    }
    return fields;
  }
  if (role === 'farmer') {
    const fields = {};
    if (values.birthday !== undefined) fields.birthday = values.birthday || null;
    if (values.farmName !== undefined) fields.farm_name = values.farmName?.trim();
    if (values.contactNumber !== undefined) fields.contact_number = values.contactNumber?.trim() || '';
    if (values.govIdFile !== undefined) fields.gov_id_file_url = values.govIdFile || null;
    // How buyers pay this farmer via GCash at checkout (see payments.controller.js's
    // getGcashCheckout) — plain stored fields, no GCash API integration of any kind.
    if (values.gcashAccountName !== undefined) fields.gcash_account_name = values.gcashAccountName?.trim() || null;
    if (values.gcashNumber !== undefined) fields.gcash_number = values.gcashNumber?.trim() || null;
    if (values.gcashQrUrl !== undefined) fields.gcash_qr_url = values.gcashQrUrl || null;
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

// Shared by getTopRatedFarmers and getAllVerifiedFarmers below — both need the same
// verified/active farmer list joined with their rating average and completed-order count,
// they just filter/cap the result differently. Deliberately hand-picks a public-safe field
// list here instead of reusing serializeProfile — a signed-out visitor must never see a
// farmer's email, contact number, address, or gov ID file, only what a buyer would browse.
async function fetchVerifiedFarmersWithStats() {
  const { data: farmers, error } = await supabaseAdmin
    .from('profiles')
    .select('id, name, farm_name, municipality, avatar_url, created_at')
    .eq('role', 'farmer')
    .eq('verification_status', 'verified')
    .neq('account_status', 'suspended');
  if (error) throw new ApiError(error.message, 400);
  if (!farmers.length) return [];

  const farmerIds = farmers.map((farmer) => farmer.id);

  const { data: ratings, error: ratingsError } = await supabaseAdmin
    .from('ratings')
    .select('farmer_id, rating')
    .in('farmer_id', farmerIds);
  if (ratingsError) throw new ApiError(ratingsError.message, 400);

  // Secondary sort key (see below) — how many orders this farmer has actually completed,
  // the same "real transactions closed" signal buyers care about alongside the star average.
  const { data: completedOrders, error: ordersError } = await supabaseAdmin
    .from('orders')
    .select('farmer_id')
    .eq('status', 'completed')
    .in('farmer_id', farmerIds);
  if (ordersError) throw new ApiError(ordersError.message, 400);

  // Same "what a buyer could actually order" gate as listPublicProducts — powers the
  // "Products Listed" stat and each card's category chips.
  const { data: products, error: productsError } = await supabaseAdmin
    .from('products')
    .select('farmer_id, category')
    .eq('status', 'active')
    .gt('quantity', 0)
    .in('farmer_id', farmerIds);
  if (productsError) throw new ApiError(productsError.message, 400);

  const summaryById = new Map();
  // Per-star tally (how many 5s, 4s, 3s, 2s, 1s) — lets the frontend show the 5/4/3/2/1
  // breakdown as separate rows instead of just the single averaged score.
  const breakdownById = new Map();
  (ratings || []).forEach(({ farmer_id: farmerId, rating }) => {
    const entry = summaryById.get(farmerId) || { total: 0, count: 0 };
    entry.total += rating;
    entry.count += 1;
    summaryById.set(farmerId, entry);

    const breakdown = breakdownById.get(farmerId) || { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    breakdown[rating] = (breakdown[rating] || 0) + 1;
    breakdownById.set(farmerId, breakdown);
  });

  const completedOrderCountById = new Map();
  (completedOrders || []).forEach(({ farmer_id: farmerId }) => {
    completedOrderCountById.set(farmerId, (completedOrderCountById.get(farmerId) || 0) + 1);
  });

  const categoryCountsById = new Map();
  (products || []).forEach(({ farmer_id: farmerId, category }) => {
    const counts = categoryCountsById.get(farmerId) || new Map();
    counts.set(category, (counts.get(category) || 0) + 1);
    categoryCountsById.set(farmerId, counts);
  });

  return farmers.map((farmer) => {
    const entry = summaryById.get(farmer.id);
    const categoryCounts = categoryCountsById.get(farmer.id);
    // Top 3 categories by how many active listings this farmer has in each — the "Vegetables
    // / Rice / Fruits" chips a buyer sees are always what they'd actually find in stock.
    const topCategories = categoryCounts
      ? [...categoryCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([category]) => category)
      : [];
    return {
      id: farmer.id,
      name: farmer.name,
      farmName: farmer.farm_name,
      municipality: farmer.municipality,
      avatarUrl: farmer.avatar_url || null,
      createdAt: farmer.created_at,
      avgRating: entry ? entry.total / entry.count : 0,
      ratingCount: entry ? entry.count : 0,
      ratingBreakdown: breakdownById.get(farmer.id) || { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
      completedOrders: completedOrderCountById.get(farmer.id) || 0,
      productCount: categoryCounts ? [...categoryCounts.values()].reduce((sum, count) => sum + count, 0) : 0,
      categories: topCategories,
    };
  });
}

// GET /api/profiles/top-farmers — public, no auth (used by the logged-out landing page to
// show off well-rated farmers).
export async function getTopRatedFarmers(req, res) {
  const topFarmers = (await fetchVerifiedFarmersWithStats())
    // Same 4-5 star bar as the buyer dashboard's "Recommended farms" (see recommendedFarmers
    // in BuyerDashboard.jsx) — a farmer starts showing up here automatically the moment their
    // average crosses into that range, computed fresh on every request, never cached.
    .filter((farmer) => farmer.avgRating >= 4)
    // 1) highest average rating, 2) most completed orders, 3) verification status — #3 is
    // already satisfied by construction (every row here passed the verified_status filter
    // above), so there's no further column left to break a tie on beyond the two below.
    .sort((a, b) => b.avgRating - a.avgRating || b.completedOrders - a.completedOrders || b.ratingCount - a.ratingCount)
    // The frontend carousel renders this whole list directly rather than paging through it —
    // Embla scrolls a fixed-size list smoothly regardless of count, so a cap this small never
    // needs real server-side pagination, just a sane upper bound on payload size.
    .slice(0, 20);

  res.json(topFarmers);
}

// GET /api/profiles/farmers — public, no auth. Backs the landing page's "View All Farmers"
// directory — every verified, active farmer (no rating floor, no cap), same sort as
// top-farmers so the ordering feels consistent between the two views.
export async function getAllVerifiedFarmers(req, res) {
  const allFarmers = (await fetchVerifiedFarmersWithStats())
    .sort((a, b) => b.avgRating - a.avgRating || b.completedOrders - a.completedOrders || b.ratingCount - a.ratingCount);

  res.json(allFarmers);
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
    // Same reasoning for both: a buyer/farmer shouldn't see a partner org (or another
    // farmer) on the map/donation-notification list before admin has actually vetted
    // their accreditation document — pending/rejected stays admin-only, like a farmer's
    // own pending/rejected state already does.
    if (req.query.role === 'farmer' || req.query.role === 'stakeholder') {
      query = query.eq('verification_status', 'verified');
    }
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
