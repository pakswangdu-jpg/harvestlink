import { supabaseAdmin } from '../lib/supabaseClient.js';
import { ApiError } from '../lib/ApiError.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireId(value) {
  if (!UUID.test(value || '')) throw new ApiError('Invalid donation or product ID.', 400);
  return value;
}

function checkError(error) {
  if (!error) return;
  if (['42P01', '42883', 'PGRST202', 'PGRST205'].includes(error.code)) {
    throw new ApiError('Donations are not configured yet. Please contact support.', 503);
  }
  const status = { '42501': 403, 'P0002': 404, '23514': 409, '22007': 400 }[error.code] || 500;
  if (status === 500) console.error('Donation database error:', error);
  throw new ApiError(status === 500 ? 'Unable to load or update donations. Please try again.' : error.message, status);
}

export function serializeDonation(row) {
  return {
    id: row.id, productId: row.product_id, productName: row.product_name,
    unit: row.unit, quantity: Number(row.quantity), location: row.location,
    image: row.image_url || '', expirationDate: row.expiration_date,
    farmerId: row.farmer_id, farmerName: row.farmer_name, status: row.status,
    requestedById: row.requested_by_id, requestedByName: row.requested_by_name,
    pickupDate: row.pickup_date, rated: row.rated,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function scopedQuery(profile) {
  let query = supabaseAdmin.from('donations').select('*');
  if (profile.role === 'farmer') query = query.eq('farmer_id', profile.id);
  if (profile.role === 'stakeholder') query = query.or(`status.eq.available,requested_by_id.eq.${profile.id}`);
  return query;
}

export async function listDonations(req, res) {
  let query = scopedQuery(req.profile).order('created_at', { ascending: false });
  if (req.query.status) query = query.eq('status', req.query.status);
  if (req.query.status === 'available') {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
    query = query.or(`expiration_date.is.null,expiration_date.gte.${today}`);
  }
  if (req.query.farmerId) query = query.eq('farmer_id', requireId(req.query.farmerId));
  if (req.query.stakeholderId) query = query.eq('requested_by_id', requireId(req.query.stakeholderId));
  const { data, error } = await query;
  checkError(error);
  res.json(data.map(serializeDonation));
}

export async function getDonation(req, res) {
  const { data, error } = await scopedQuery(req.profile).eq('id', requireId(req.params.id)).maybeSingle();
  checkError(error);
  if (!data) throw new ApiError('Donation was not found.', 404);
  res.json(serializeDonation(data));
}

export async function createDonation(req, res) {
  const { data, error } = await supabaseAdmin.rpc('create_surplus_donation', {
    actor_id: req.profile.id, source_product_id: requireId(req.body?.productId),
  });
  checkError(error);
  res.status(201).json(serializeDonation(data));
}

export async function updateDonation(req, res) {
  const pickupDate = req.body?.pickupDate || null;
  if (req.params.action === 'schedule' && (!/^\d{4}-\d{2}-\d{2}$/.test(pickupDate || '')
    || Number.isNaN(Date.parse(pickupDate)) || new Date(pickupDate).toISOString().slice(0, 10) !== pickupDate)) {
    throw new ApiError('Choose a valid pickup date.', 400);
  }
  const { data, error } = await supabaseAdmin.rpc('transition_surplus_donation', {
    actor_id: req.profile.id, donation_id: requireId(req.params.id),
    action_name: req.params.action, scheduled_date: req.params.action === 'schedule' ? pickupDate : null,
  });
  checkError(error);
  res.json(serializeDonation(data));
}
