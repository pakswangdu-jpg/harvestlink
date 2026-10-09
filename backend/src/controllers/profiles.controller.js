import { supabaseAdmin } from '../lib/supabaseClient.js';
import { serializeProfile } from '../lib/serialize.js';
import { getAdminUserPage, manageAccount } from '../lib/adminUserQueries.js';
import { ApiError } from '../lib/ApiError.js';
import { invalidateAuthCacheForUser } from '../middleware/requireAuth.js';

import { profileLocationFields } from '../lib/profileLocation.js';

export const VALID_ROLES = ['farmer', 'buyer', 'stakeholder'];
const PROFILE_DIRECTORY_SELECT = [
  'id',
  'role',
  'email',
  'first_name',
  'middle_name',
  'last_name',
  'name',
  'contact_number',
  'address',
  'zip_code',
  'municipality',
  'latitude',
  'longitude',
  'account_status',
  'avatar_url',
  'farm_name',
  'birthday',
  'gov_id_file_url',
  'verification_status',
  'verification_acknowledged',
  'verified_at',
  'organization_name',
  'organization_type',
  'contact_person',
  'accreditation_file_url',
  'organization_description',
  'barangay',
  'partnership_description',
  'gcash_account_name',
  'gcash_number',
  'gcash_qr_url',
  'last_active_at',
  'created_at',
  'updated_at',
].join(', ');
const FARMER_DIRECTORY_CACHE_TTL_MS = 15 * 1000;
let farmerDirectoryCache = null;
let farmerDirectoryCacheExpiresAt = 0;
let pendingFarmerDirectory = null;









export function buildCommonFields(values) {
  const fields = profileLocationFields(values);


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



  if (values.avatarUrl !== undefined) fields.avatar_url = values.avatarUrl || null;

  return fields;
}











export function buildRoleFields(role, values, { isCreate }) {



  if (role === 'stakeholder') {
    const fields = {};
    if (values.organizationName !== undefined) fields.organization_name = values.organizationName?.trim();
    if (values.organizationType !== undefined) fields.organization_type = values.organizationType;
    if (values.contactPerson !== undefined) fields.contact_person = values.contactPerson?.trim();
    if (values.contactNumber !== undefined) fields.contact_number = values.contactNumber?.trim() || '';
    if (values.accreditationFile !== undefined) fields.accreditation_file_url = values.accreditationFile || null;



    if (values.organizationDescription !== undefined) fields.organization_description = values.organizationDescription?.trim();
    if (values.barangay !== undefined) fields.barangay = values.barangay?.trim();
    if (values.partnershipDescription !== undefined) fields.partnership_description = values.partnershipDescription?.trim();




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
  if (error) {
    console.error('Failed to update profile in Supabase:', {
      code: error.code,
      message: error.message,
      hint: error.hint,
    });
    throw new ApiError(error.message, 400);
  }
  invalidateAuthCacheForUser(req.profile.id);
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
  invalidateAuthCacheForUser(req.profile.id);
  res.json(serializeProfile(data));
}

export async function getProfileById(req, res) {
  const { data, error } = await supabaseAdmin.from('profiles').select('*').eq('id', req.params.id).single();
  if (error || !data) throw new ApiError('Account was not found.', 404);
  res.json(serializeProfile(data));
}

export async function getNearbyMapProfiles(req, res) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, role, name, farm_name, municipality, latitude, longitude, avatar_url, organization_name, last_active_at')
    .in('role', VALID_ROLES)
    .neq('account_status', 'suspended')
    .not('latitude', 'is', null)
    .not('longitude', 'is', null);

  if (error) throw new ApiError(error.message, 400);

  res.json(data.map(serializeProfile).filter((profile) => (
    profile.latitude !== null && profile.longitude !== null
  )));
}

async function loadVerifiedFarmersWithStats() {
  const { data: farmers, error } = await supabaseAdmin
    .from('profiles')
    .select('id, name, farm_name, municipality, avatar_url, created_at')
    .eq('role', 'farmer')
    .eq('verification_status', 'verified')
    .neq('account_status', 'suspended');
  if (error) throw new ApiError(error.message, 400);
  if (!farmers.length) return [];

  const farmerIds = farmers.map((farmer) => farmer.id);

  const [ratingsResult, ordersResult, productsResult] = await Promise.all([
    supabaseAdmin.from('ratings').select('farmer_id, rating').in('farmer_id', farmerIds),
    supabaseAdmin.from('orders').select('farmer_id').eq('status', 'completed').in('farmer_id', farmerIds),
    supabaseAdmin
      .from('products')
      .select('farmer_id, category')
      .eq('status', 'active')
      .gt('quantity', 0)
      .or(`expiration_date.is.null,expiration_date.gte.${new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Manila',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date())}`)
      .in('farmer_id', farmerIds),
  ]);
  const { data: ratings, error: ratingsError } = ratingsResult;
  const { data: completedOrders, error: ordersError } = ordersResult;
  const { data: products, error: productsError } = productsResult;
  if (ratingsError) throw new ApiError(ratingsError.message, 400);
  if (ordersError) throw new ApiError(ordersError.message, 400);
  if (productsError) throw new ApiError(productsError.message, 400);

  const summaryById = new Map();


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

async function fetchVerifiedFarmersWithStats() {
  if (farmerDirectoryCache && farmerDirectoryCacheExpiresAt > Date.now()) return farmerDirectoryCache;
  if (pendingFarmerDirectory) return pendingFarmerDirectory;

  pendingFarmerDirectory = loadVerifiedFarmersWithStats()
    .then((farmers) => {
      farmerDirectoryCache = farmers;
      farmerDirectoryCacheExpiresAt = Date.now() + FARMER_DIRECTORY_CACHE_TTL_MS;
      return farmers;
    })
    .finally(() => { pendingFarmerDirectory = null; });
  return pendingFarmerDirectory;
}



export async function getTopRatedFarmers(req, res) {
  const topFarmers = (await fetchVerifiedFarmersWithStats())



    .filter((farmer) => farmer.avgRating >= 4)



    .sort((a, b) => b.avgRating - a.avgRating || b.completedOrders - a.completedOrders || b.ratingCount - a.ratingCount)



    .slice(0, 20);

  res.json(topFarmers);
}




export async function getAllVerifiedFarmers(req, res) {
  const allFarmers = (await fetchVerifiedFarmersWithStats())
    .sort((a, b) => b.avgRating - a.avgRating || b.completedOrders - a.completedOrders || b.ratingCount - a.ratingCount);

  res.json(allFarmers);
}







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






export async function listProfiles(req, res) {
  if (req.query.page !== undefined) return getAdminUserPage(req, res);
  const isAdmin = req.profile.role === 'admin';
  let query = supabaseAdmin.from('profiles').select(PROFILE_DIRECTORY_SELECT);

  if (req.query.role) query = query.eq('role', req.query.role);

  if (isAdmin) {
    if (req.query.verificationStatus) query = query.eq('verification_status', req.query.verificationStatus);
    if (req.query.accountStatus) query = query.eq('account_status', req.query.accountStatus);
  } else {
    query = query.neq('account_status', 'suspended');




    if (req.query.role === 'farmer' || req.query.role === 'stakeholder') {
      query = query.eq('verification_status', 'verified');
    }
  }

  const { data, error } = await query;
  if (error) throw new ApiError(error.message, 400);

  const serialized = data.map(serializeProfile);


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

  const data = await manageAccount(req, 'verification');
  invalidateAuthCacheForUser(req.params.id);

  res.json(serializeProfile(data));
}

export async function setAccountStatus(req, res) {
  const { status } = req.body;
  if (!['active', 'suspended'].includes(status)) throw new ApiError('Invalid account status.', 400);

  const data = await manageAccount(req, 'account');
  invalidateAuthCacheForUser(req.params.id);
  res.json(serializeProfile(data));
}




export async function getVerificationDocuments(req, res) {
  const { data: profile, error } = await supabaseAdmin.from('profiles').select('*').eq('id', req.params.id).single();
  if (error || !profile) throw new ApiError('Account was not found.', 404);





  const paths = { govIdFile: profile.gov_id_file_url, accreditationFile: profile.accreditation_file_url };
  const signedUrls = {};
  for (const [key, path] of Object.entries(paths)) {
    if (!path) continue;
    const { data: signed } = await supabaseAdmin.storage.from('verification-documents').createSignedUrl(path, 60);
    if (signed) signedUrls[key] = signed.signedUrl;
  }
  res.json(signedUrls);
}
