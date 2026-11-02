import { supabaseAdmin } from '../lib/supabaseClient.js';
import { ApiError } from '../lib/ApiError.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireId(value) {
  if (!UUID.test(value || '')) throw new ApiError('Invalid donation or product ID.', 400);
  return value;
}

function parseExpirationAt(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match.map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth || hour > 23 || minute > 59 || second > 59) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function checkError(error) {
  if (!error) return;
  if (['42P01', '42883', 'PGRST202', 'PGRST205'].includes(error.code)) {
    throw new ApiError('Donations are not configured yet. Please contact support.', 503);
  }
  const status = { '42501': 403, 'P0002': 404, '23514': 409, '23505': 409, '22007': 400 }[error.code] || 500;
  if (status === 500) console.error('Donation database error:', error);
  throw new ApiError(status === 500 ? 'Unable to load or update donations. Please try again.' : error.message, status);
}

export function serializeDonation(row, extra = {}) {
  return {
    id: row.id, productId: row.product_id, productName: row.product_name,
    unit: row.unit, quantity: Number(row.quantity), availableQuantity: Number(row.available_quantity ?? row.quantity),
    claimedQuantity: Number(row.claimed_quantity || 0), location: row.location,
    description: row.description || '',
    image: row.image_url || '', expirationDate: row.expiration_date,
    expirationAt: row.expiration_at || null,
    farmerId: row.farmer_id, farmerName: row.farmer_name, status: row.status,
    requestedById: row.requested_by_id, requestedByName: row.requested_by_name,
    pickupDate: row.pickup_date, rated: row.rated,
    createdAt: row.created_at, updatedAt: row.updated_at,
    ...extra,
  };
}

function serializeClaim(row) {
  return {
    id: row.id,
    donationId: row.donation_id,
    stakeholderId: row.stakeholder_id,
    stakeholderName: row.stakeholder_name,
    quantity: Number(row.quantity),
    status: row.status,
    pickupDate: row.pickup_date || null,
    rated: Boolean(row.rated),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function scopedQuery(profile, options) {
  let query = supabaseAdmin.from('donations').select('*', options);
  if (profile.role === 'farmer') query = query.eq('farmer_id', profile.id);
  if (profile.role === 'stakeholder') query = query.or(`status.in.(available,fully_claimed),requested_by_id.eq.${profile.id}`);
  return query;
}

async function attachClaims(rows, profile) {
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  let query = supabaseAdmin.from('donation_claims').select('*');
  // Keep older local test doubles and pre-migration development environments
  // readable; the real Supabase builder always exposes `in`.
  if (typeof query.in !== 'function') return rows.map((row) => serializeDonation(row));
  query = query.in('donation_id', ids);
  if (profile.role === 'stakeholder') query = query.eq('stakeholder_id', profile.id);
  const { data: claims, error } = await query.order('created_at', { ascending: false });
  if (error) {
    if (['42P01', 'PGRST205'].includes(error.code)) return rows.map((row) => serializeDonation(row));
    throw new ApiError(error.message, 400);
  }
  const claimsByDonation = new Map();
  (claims || []).forEach((claim) => {
    const list = claimsByDonation.get(claim.donation_id) || [];
    list.push(serializeClaim(claim));
    claimsByDonation.set(claim.donation_id, list);
  });
  return rows
    .map((row) => {
      const claimRows = claimsByDonation.get(row.id) || [];
      return serializeDonation(row, {
        claims: profile.role === 'farmer' ? claimRows : undefined,
        myClaim: profile.role === 'stakeholder' ? claimRows.find((claim) => ['pending', 'scheduled'].includes(claim.status)) || claimRows[0] || null : undefined,
      });
    })
    .filter((row) => profile.role !== 'stakeholder' || row.status === 'available' || row.requestedById === profile.id || row.myClaim);
}

export async function listDonations(req, res) {
  if (req.query.page !== undefined) {
    if (req.profile.role !== 'admin') throw new ApiError('Only admins can use this donation overview.', 403);
    return listAdminDonationPage(req, res);
  }
  if (typeof supabaseAdmin.rpc === 'function') {
    const expiryResult = await supabaseAdmin.rpc('expire_donations');
    if (expiryResult?.error && !['42883', 'PGRST202', 'PGRST205'].includes(expiryResult.error.code)) {
      throw expiryResult.error;
    }
  }
  if (req.query.stakeholderId && req.profile.role === 'stakeholder' && req.query.stakeholderId !== req.profile.id) {
    throw new ApiError('You can only view your own donation requests.', 403);
  }
  let query;
  if (req.query.stakeholderId && req.profile.role === 'stakeholder') {
    const { data: claims, error: claimsError } = await supabaseAdmin
      .from('donation_claims').select('donation_id').eq('stakeholder_id', req.profile.id);
    if (claimsError && !['42P01', 'PGRST205'].includes(claimsError.code)) throw new ApiError(claimsError.message, 400);
    const ids = [...new Set((claims || []).map((claim) => claim.donation_id))];
    query = supabaseAdmin.from('donations').select('*');
    const filters = [`requested_by_id.eq.${req.profile.id}`];
    if (ids.length) filters.push(`id.in.(${ids.join(',')})`);
    query = query.or(filters.join(','));
  } else {
    query = scopedQuery(req.profile);
  }
  query = query.order('created_at', { ascending: false });
  if (req.query.status) query = query.eq('status', req.query.status);
  if (req.query.status === 'available') {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
    query = query.or(`expiration_date.is.null,expiration_date.gte.${today}`);
  }
  if (req.query.farmerId) query = query.eq('farmer_id', requireId(req.query.farmerId));
  if (req.query.stakeholderId && req.profile.role !== 'stakeholder') query = query.eq('requested_by_id', requireId(req.query.stakeholderId));
  const { data, error } = await query;
  checkError(error);
  res.json(await attachClaims(data || [], req.profile));
}

const DONATION_STATUSES = ['available', 'requested', 'scheduled', 'completed', 'cancelled', 'expired', 'fully_claimed'];

async function listAdminDonationPage(req, res) {
  const page = Number(req.query.page);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000) throw new ApiError('Invalid donation page.', 400);
  const status = req.query.status || '';
  if (status && !DONATION_STATUSES.includes(status)) throw new ApiError('Invalid donation status.', 400);
  const search = String(req.query.search || '').trim();
  if (search.length > 120) throw new ApiError('Search must be 120 characters or fewer.', 400);
  const dates = ['from', 'to'].map((key) => {
    const value = req.query[key];
    if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) {
      throw new ApiError('Choose a valid date.', 400);
    }
    return value;
  });
  if (dates[0] && dates[1] && dates[0] > dates[1]) throw new ApiError('Start date must be before end date.', 400);
  let query = scopedQuery(req.profile, { count: 'exact' });
  if (status) query = query.eq('status', status);
  // Quoted PostgREST values prevent search punctuation from altering the filter.
  if (search) {
    const pattern = `"%${search.replace(/[\\%_*]/g, '\\$&').replace(/"/g, '\\"')}%"`;
    query = query.or(['product_name', 'farmer_name', 'requested_by_name'].map((field) => `${field}.ilike.${pattern}`).join(','));
  }
  if (dates[0]) query = query.gte('created_at', `${dates[0]}T00:00:00+08:00`);
  if (dates[1]) {
    const nextDay = new Date(`${dates[1]}T00:00:00+08:00`);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    query = query.lt('created_at', nextDay.toISOString());
  }
  const pageSize = 20;
  const { data, count, error } = await query.order('created_at', { ascending: false }).order('id', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  checkError(error);
  const counts = {};
  for (const value of DONATION_STATUSES) {
    const result = await scopedQuery(req.profile, { count: 'exact', head: true }).eq('status', value);
    checkError(result.error);
    counts[value] = result.count || 0;
  }
  res.json({ donations: data.map(serializeDonation), total: count || 0, page, pageSize, counts });
}

export async function getDonation(req, res) {
  const { data, error } = await scopedQuery(req.profile).eq('id', requireId(req.params.id)).maybeSingle();
  checkError(error);
  if (!data) throw new ApiError('Donation was not found.', 404);
  const [row] = await attachClaims([data], req.profile);
  if (!row) throw new ApiError('Donation was not found.', 404);
  res.json(row);
}

export async function createDonation(req, res) {
  const expirationAt = req.body?.expirationAt;
  const expiration = parseExpirationAt(expirationAt);
  if (!expiration) {
    throw new ApiError('Choose a valid donation expiration date and time.', 400);
  }
  const { data, error } = await supabaseAdmin.rpc('create_surplus_donation', {
    actor_id: req.profile.id, source_product_id: requireId(req.body?.productId), p_expiration_at: expiration.toISOString(),
  });
  checkError(error);
  res.status(201).json(serializeDonation(data));
}

export async function createDonationClaim(req, res) {
  const quantity = Number(req.body?.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) throw new ApiError('Enter a positive donation quantity.', 400);
  const { data, error } = await supabaseAdmin.rpc('claim_surplus_donation', {
    actor_id: req.profile.id,
    target_donation_id: requireId(req.params.id),
    requested_quantity: quantity,
  });
  checkError(error);
  res.status(201).json(serializeClaim(data));
}

export async function transitionDonationClaim(req, res) {
  const action = req.params.action;
  const pickupDate = req.body?.pickupDate || null;
  if (action === 'schedule' && (!/^\d{4}-\d{2}-\d{2}$/.test(pickupDate)
    || Number.isNaN(Date.parse(pickupDate)) || new Date(pickupDate).toISOString().slice(0, 10) !== pickupDate)) {
    throw new ApiError('Choose a valid pickup date.', 400);
  }
  const { data, error } = await supabaseAdmin.rpc('transition_surplus_donation_claim', {
    actor_id: req.profile.id,
    target_claim_id: requireId(req.params.claimId),
    action_name: action,
    scheduled_date: action === 'schedule' ? pickupDate : null,
  });
  checkError(error);
  res.json(serializeClaim(data));
}

export async function updateDonation(req, res) {
  const pickupDate = req.body?.pickupDate || null;
  if (req.params.action === 'schedule' && (!/^\d{4}-\d{2}-\d{2}$/.test(pickupDate || '')
    || Number.isNaN(Date.parse(pickupDate)) || new Date(pickupDate).toISOString().slice(0, 10) !== pickupDate)) {
    throw new ApiError('Choose a valid pickup date.', 400);
  }
  const isFarmerWithdrawal = req.params.action === 'cancel' && req.profile.role === 'farmer';
  const { data, error } = isFarmerWithdrawal
    ? await supabaseAdmin.rpc('withdraw_surplus_donation', {
      actor_id: req.profile.id, target_donation_id: requireId(req.params.id),
    })
    : await supabaseAdmin.rpc('transition_surplus_donation', {
      actor_id: req.profile.id, donation_id: requireId(req.params.id),
      action_name: req.params.action, scheduled_date: req.params.action === 'schedule' ? pickupDate : null,
    });
  checkError(error);
  res.json(serializeDonation(data));
}
