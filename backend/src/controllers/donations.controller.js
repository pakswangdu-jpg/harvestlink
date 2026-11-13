import { supabaseAdmin } from '../lib/supabaseClient.js';
import { ApiError } from '../lib/ApiError.js';
import { createNotification } from '../lib/notify.js';
import {
  DONATION_ARRIVAL_POKE_COOLDOWN_MS,
  evaluateDonationArrival,
  FARMER_ARRIVAL_NOTIFICATION_MESSAGE,
  FARMER_ARRIVAL_NOTIFICATION_TITLE,
  validCoordinatePair,
} from '../lib/donationArrival.js';
import { getMunicipalityCoords } from '../utils/constants.js';
import { emitDonationTrackingUpdate } from '../realtime/orderTracking.js';

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
  if (['42703', 'PGRST204'].includes(error.code)) {
    throw new ApiError(
      'Donation pickup tracking is not enabled in the database. Apply the 20261112_donation_pickup_tracking.sql migration and retry.',
      503,
      'DONATION_TRACKING_MIGRATION_REQUIRED',
    );
  }
  if (['42P01', '42883', 'PGRST202', 'PGRST205'].includes(error.code)) {
    throw new ApiError('Donations are not configured yet. Please contact support.', 503);
  }
  const status = { '42501': 403, 'P0002': 404, '23514': 409, '23505': 409, '22007': 400 }[error.code] || 500;
  if (status === 500) console.error('Donation database error:', error);
  throw new ApiError(status === 500 ? 'Unable to load or update donations. Please try again.' : error.message, status);
}

function registeredProfileCoordinates(profile) {
  if (profile?.latitude == null || profile.latitude === ''
    || profile?.longitude == null || profile.longitude === '') return null;
  const coordinates = { lat: Number(profile.latitude), lng: Number(profile.longitude) };
  return validCoordinatePair(coordinates) ? coordinates : null;
}

function serializedArrivalNotifiedAt(row) {
  return row?.arrival_notified_at || null;
}

function inferPickupStatus(row) {
  if (!row || typeof row !== 'object') return 'none';
  if (row.pickup_status && row.pickup_status !== 'none') {
    if (row.status === 'completed') return 'confirmed';
    if (row.status === 'cancelled' || row.status === 'rejected') return 'cancelled';
    return row.pickup_status;
  }
  if (row.status === 'completed' || row.confirmed_at) return 'confirmed';
  if (row.status === 'cancelled' || row.status === 'rejected') return 'cancelled';
  if (row.status === 'scheduled') {
    if (row.arrived_at || Number(row.consecutive_arrival_readings || 0) >= 2) {
      return 'awaiting_confirmation';
    }
    if (row.current_lat != null && row.current_lng != null) {
      return 'on_the_way';
    }
    return 'awaiting_pickup';
  }
  if (row.status === 'requested' || row.status === 'pending') return 'requested';
  return 'none';
}

export function serializeDonation(row, extra = {}) {
  return {
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    unit: row.unit,
    quantity: Number(row.quantity),
    availableQuantity: Number(row.available_quantity ?? row.quantity),
    claimedQuantity: Number(row.claimed_quantity || 0),
    location: row.location,
    description: row.description || '',
    image: row.image_url || '',
    expirationDate: row.expiration_date,
    expirationAt: row.expiration_at || null,
    farmerId: row.farmer_id,
    farmerName: row.farmer_name,
    status: row.status,
    pickupStatus: inferPickupStatus(row),
    requestedById: row.requested_by_id,
    requestedByName: row.requested_by_name,
    pickupDate: row.pickup_date,
    currentLat: row.current_lat != null ? Number(row.current_lat) : null,
    currentLng: row.current_lng != null ? Number(row.current_lng) : null,
    currentAccuracy: row.current_accuracy != null ? Number(row.current_accuracy) : null,
    currentHeading: row.current_heading != null ? Number(row.current_heading) : null,
    currentSpeed: row.current_speed != null ? Number(row.current_speed) : null,
    locationUpdatedAt: row.location_updated_at || null,
    transitStartedAt: row.transit_started_at || null,
    consecutiveArrivalReadings: Number(row.consecutive_arrival_readings || 0),
    arrivedAt: row.arrived_at || null,
    arrivalNotifiedAt: serializedArrivalNotifiedAt(row),
    confirmedAt: row.confirmed_at || null,
    rated: row.rated,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...extra,
  };
}

export function serializeClaim(row) {
  return {
    id: row.id,
    donationId: row.donation_id,
    stakeholderId: row.stakeholder_id,
    stakeholderName: row.stakeholder_name,
    quantity: Number(row.quantity),
    status: row.status,
    pickupStatus: inferPickupStatus(row),
    pickupDate: row.pickup_date || null,
    currentLat: row.current_lat != null ? Number(row.current_lat) : null,
    currentLng: row.current_lng != null ? Number(row.current_lng) : null,
    currentAccuracy: row.current_accuracy != null ? Number(row.current_accuracy) : null,
    currentHeading: row.current_heading != null ? Number(row.current_heading) : null,
    currentSpeed: row.current_speed != null ? Number(row.current_speed) : null,
    locationUpdatedAt: row.location_updated_at || null,
    transitStartedAt: row.transit_started_at || null,
    consecutiveArrivalReadings: Number(row.consecutive_arrival_readings || 0),
    arrivedAt: row.arrived_at || null,
    arrivalNotifiedAt: serializedArrivalNotifiedAt(row),
    confirmedAt: row.confirmed_at || null,
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
  const claimId = requireId(req.params.claimId);
  const { data, error } = await supabaseAdmin.rpc('transition_surplus_donation_claim', {
    actor_id: req.profile.id,
    target_claim_id: claimId,
    action_name: action,
    scheduled_date: action === 'schedule' ? pickupDate : null,
  });
  checkError(error);
  const serialized = serializeClaim(data);
  emitDonationTrackingUpdate(claimId, 'donation-status-update', serialized);
  if (data?.donation_id) {
    emitDonationTrackingUpdate(data.donation_id, 'donation-status-update', serialized);
  }
  res.json(serialized);
}

export async function updateDonation(req, res) {
  if (req.params.action === 'request') return createDonationClaim(req, res);
  const pickupDate = req.body?.pickupDate || null;
  if (req.params.action === 'schedule' && (!/^\d{4}-\d{2}-\d{2}$/.test(pickupDate || '')
    || Number.isNaN(Date.parse(pickupDate)) || new Date(pickupDate).toISOString().slice(0, 10) !== pickupDate)) {
    throw new ApiError('Choose a valid pickup date.', 400);
  }
  const donationId = requireId(req.params.id);
  const isFarmerWithdrawal = req.params.action === 'cancel' && req.profile.role === 'farmer';
  const { data, error } = isFarmerWithdrawal
    ? await supabaseAdmin.rpc('withdraw_surplus_donation', {
      actor_id: req.profile.id, target_donation_id: donationId,
    })
    : await supabaseAdmin.rpc('transition_surplus_donation', {
      actor_id: req.profile.id, donation_id: donationId,
      action_name: req.params.action, scheduled_date: req.params.action === 'schedule' ? pickupDate : null,
    });
  checkError(error);
  const serialized = serializeDonation(data);
  emitDonationTrackingUpdate(donationId, 'donation-status-update', serialized);
  res.json(serialized);
}

async function resolveDonationTrackingSession(req) {
  const rawClaimId = req.params.claimId || req.query?.claimId || req.body?.claimId || null;
  const rawDonationId = req.params.id || req.body?.donationId || null;

  let claim = null;
  let donation;

  if (rawClaimId) {
    const claimId = requireId(rawClaimId);
    const { data: claimData, error: claimError } = await supabaseAdmin
      .from('donation_claims')
      .select('*')
      .eq('id', claimId)
      .maybeSingle();
    checkError(claimError);
    if (!claimData) throw new ApiError('Donation claim was not found.', 404);
    claim = claimData;

    const { data: donationData, error: donationError } = await supabaseAdmin
      .from('donations')
      .select('*')
      .eq('id', claim.donation_id)
      .maybeSingle();
    checkError(donationError);
    if (!donationData) throw new ApiError('Donation was not found.', 404);
    donation = donationData;
  } else {
    const donationId = requireId(rawDonationId);
    const { data: donationData, error: donationError } = await supabaseAdmin
      .from('donations')
      .select('*')
      .eq('id', donationId)
      .maybeSingle();
    checkError(donationError);
    if (!donationData) throw new ApiError('Donation was not found.', 404);
    donation = donationData;

    if (!donation.requested_by_id) {
      let claimsQuery = supabaseAdmin.from('donation_claims').select('*');
      if (typeof claimsQuery.eq === 'function') {
        claimsQuery = claimsQuery.eq('donation_id', donation.id);
        if (req.profile?.role === 'stakeholder') {
          claimsQuery = claimsQuery.eq('stakeholder_id', req.profile.id);
        }
        const { data: claimRows } = await claimsQuery;
        if (Array.isArray(claimRows) && claimRows.length > 0) {
          claim =
            claimRows.find((row) => row.status === 'scheduled') ||
            claimRows.find((row) => row.status === 'completed') ||
            claimRows[0];
        }
      }
    }
  }

  const stakeholderId = claim ? claim.stakeholder_id : donation.requested_by_id;
  const stakeholderName = claim
    ? claim.stakeholder_name
    : donation.requested_by_name;
  const farmerId = donation.farmer_id;

  return {
    kind: claim ? 'claim' : 'donation',
    donation,
    claim,
    record: claim || donation,
    farmerId,
    stakeholderId,
    stakeholderName,
  };
}

function assertTrackingSessionParty(req, session) {
  if (!req.profile || (req.profile.role !== 'farmer' && req.profile.role !== 'stakeholder')) {
    throw new ApiError('Only the donating farmer and requesting stakeholder can access donation tracking.', 403);
  }
  const isFarmer = req.profile.role === 'farmer' && req.profile.id === session.farmerId;
  const isStakeholder =
    req.profile.role === 'stakeholder' &&
    Boolean(session.stakeholderId) &&
    req.profile.id === session.stakeholderId;
  if (!isFarmer && !isStakeholder) {
    throw new ApiError('You do not have permission to access this donation tracking session.', 403);
  }
  return { isFarmer, isStakeholder };
}

async function fetchPartyProfiles(session) {
  const profileFields = 'id, role, name, farm_name, organization_name, address, municipality, latitude, longitude';
  const [farmerRes, stakeholderRes] = await Promise.all([
    supabaseAdmin.from('profiles').select(profileFields).eq('id', session.farmerId).maybeSingle(),
    session.stakeholderId
      ? supabaseAdmin.from('profiles').select(profileFields).eq('id', session.stakeholderId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  const rawFarmer = farmerRes?.data || {
    id: session.farmerId,
    role: 'farmer',
    name: session.donation.farmer_name,
    farm_name: session.donation.farmer_name,
    address: session.donation.location,
    municipality: session.donation.location,
  };
  const farmerCoords = registeredProfileCoordinates(rawFarmer);

  const farmer = {
    ...rawFarmer,
    farm_name: rawFarmer.farm_name || session.donation.farmer_name || rawFarmer.name,
    address: rawFarmer.address || session.donation.location || rawFarmer.municipality,
    municipality: rawFarmer.municipality || session.donation.location,
    latitude: farmerCoords?.lat ?? null,
    longitude: farmerCoords?.lng ?? null,
  };

  const rawStakeholder = stakeholderRes?.data || {
    id: session.stakeholderId,
    role: 'stakeholder',
    name: session.stakeholderName || 'Stakeholder',
    organization_name: session.stakeholderName || 'Stakeholder',
    address: session.donation.location,
    municipality: session.donation.location,
  };
  const stakeholderCoords = registeredProfileCoordinates(rawStakeholder);

  const stakeholder = {
    ...rawStakeholder,
    name: rawStakeholder.organization_name || rawStakeholder.name || session.stakeholderName || 'Stakeholder',
    latitude: stakeholderCoords?.lat ?? null,
    longitude: stakeholderCoords?.lng ?? null,
  };

  return { farmer, stakeholder };
}

export async function getDonationTrackingProfiles(req, res) {
  const session = await resolveDonationTrackingSession(req);
  assertTrackingSessionParty(req, session);
  const { farmer, stakeholder } = await fetchPartyProfiles(session);
  if (typeof res.setHeader === 'function') {
    res.setHeader('Cache-Control', 'no-store');
  }
  res.json({
    farmer,
    buyer: stakeholder,
    stakeholder,
    donation: serializeDonation(session.donation),
    claim: session.claim ? serializeClaim(session.claim) : null,
  });
}

export async function updateDonationPickupLocation(req, res) {
  const session = await resolveDonationTrackingSession(req);
  const { isStakeholder } = assertTrackingSessionParty(req, session);
  if (!isStakeholder) {
    throw new ApiError('Only the requesting stakeholder can share a live pickup location.', 403);
  }

  const record = session.record;
  if (record.status === 'completed' || record.pickup_status === 'confirmed') {
    throw new ApiError('This donation handover has already been confirmed.', 409);
  }
  if (record.status === 'cancelled' || record.status === 'rejected' || record.pickup_status === 'cancelled') {
    throw new ApiError('This donation request has been cancelled.', 409);
  }
  if (record.status !== 'scheduled') {
    throw new ApiError('Live pickup tracking is only active after the farmer accepts the donation request.', 409);
  }

  const lat = Number(req.body?.lat);
  const lng = Number(req.body?.lng);
  if (!validCoordinatePair({ lat, lng })) {
    throw new ApiError('A valid GPS latitude and longitude are required.', 400);
  }
  const accuracy =
    req.body?.accuracy == null || req.body?.accuracy === '' ? null : Number(req.body.accuracy);
  if (accuracy != null && (!Number.isFinite(accuracy) || accuracy < 0)) {
    throw new ApiError('GPS accuracy must be a non-negative number.', 400);
  }
  const heading =
    req.body?.heading == null || req.body?.heading === '' ? null : Number(req.body.heading);
  const speed =
    req.body?.speed == null || req.body?.speed === '' ? null : Number(req.body.speed);

  const { farmer } = await fetchPartyProfiles(session);
  const farmCoords = registeredProfileCoordinates(farmer)
    || getMunicipalityCoords(farmer.municipality || session.donation.location);
  const locationUpdatedAt = new Date().toISOString();

  const arrival = evaluateDonationArrival({
    previousReadings: record.consecutive_arrival_readings,
    arrivedAt: record.arrived_at,
    sample: { lat, lng, accuracy },
    farmCoords,
    now: locationUpdatedAt,
  });

  const table = session.kind === 'claim' ? 'donation_claims' : 'donations';
  const baseUpdate = {
    current_lat: lat,
    current_lng: lng,
    location_updated_at: locationUpdatedAt,
    updated_at: locationUpdatedAt,
  };
  const enrichedUpdate = {
    ...baseUpdate,
    current_accuracy: Number.isFinite(accuracy) ? accuracy : null,
    current_heading: Number.isFinite(heading) ? heading : null,
    current_speed: Number.isFinite(speed) ? speed : null,
    transit_started_at: record.transit_started_at || locationUpdatedAt,
    consecutive_arrival_readings: arrival.consecutiveArrivalReadings,
    arrived_at: arrival.arrivedAt,
    pickup_status: arrival.pickupStatus,
  };

  let { data: updated, error: updateError } = await supabaseAdmin
    .from(table)
    .update(enrichedUpdate)
    .eq('id', record.id)
    .select('*')
    .maybeSingle();

  if (updateError?.code === 'PGRST204' || updateError?.code === '42703') {
    ({ data: updated, error: updateError } = await supabaseAdmin
      .from(table)
      .update(baseUpdate)
      .eq('id', record.id)
      .select('*')
      .maybeSingle());
  }
  checkError(updateError);

  const mergedRecord = {
    ...record,
    ...enrichedUpdate,
    ...(updated || {}),
  };

  const serialized =
    session.kind === 'claim'
      ? serializeClaim(mergedRecord)
      : serializeDonation(mergedRecord);

  const realtimePayload = {
    orderId: record.id,
    donationId: session.donation.id,
    claimId: session.claim?.id || null,
    lat,
    lng,
    accuracy: Number.isFinite(accuracy) ? accuracy : null,
    heading: Number.isFinite(heading) ? heading : null,
    speed: Number.isFinite(speed) ? speed : null,
    locationUpdatedAt,
    serverNow: Date.now(),
    pickupStatus: arrival.pickupStatus,
    arrived: arrival.arrived,
    arrivedAt: arrival.arrivedAt,
    isApproaching: arrival.isApproaching,
    distanceMeters: arrival.distanceMeters,
    consecutiveArrivalReadings: arrival.consecutiveArrivalReadings,
  };

  emitDonationTrackingUpdate(record.id, 'location-update', realtimePayload);
  emitDonationTrackingUpdate(record.id, 'donation-status-update', serialized);
  if (session.kind === 'claim') {
    emitDonationTrackingUpdate(session.donation.id, 'location-update', realtimePayload);
    emitDonationTrackingUpdate(session.donation.id, 'donation-status-update', serialized);
  }
  if (arrival.newlyArrived) {
    emitDonationTrackingUpdate(record.id, 'donation-arrival', realtimePayload);
    if (session.kind === 'claim') {
      emitDonationTrackingUpdate(session.donation.id, 'donation-arrival', realtimePayload);
    }
  }

  res.json({
    ...serialized,
    arrival,
  });
}

export async function notifyFarmerOfDonationArrival(req, res) {
  const session = await resolveDonationTrackingSession(req);
  const { isStakeholder } = assertTrackingSessionParty(req, session);
  if (!isStakeholder) {
    throw new ApiError('Only the requesting stakeholder can notify the farmer of arrival.', 403);
  }

  const record = session.record;
  if (record.status !== 'scheduled') {
    throw new ApiError('Only scheduled donation pickups can notify the farmer of arrival.', 409);
  }
  const previousArrivalNotificationAt = serializedArrivalNotifiedAt(record);
  const now = Date.now();
  const previousPokeTime = previousArrivalNotificationAt
    ? new Date(previousArrivalNotificationAt).getTime()
    : null;
  if (previousPokeTime !== null && now - previousPokeTime < DONATION_ARRIVAL_POKE_COOLDOWN_MS) {
    const remainingSeconds = Math.ceil(
      (DONATION_ARRIVAL_POKE_COOLDOWN_MS - (now - previousPokeTime)) / 1000,
    );
    throw new ApiError(
      `Please wait ${remainingSeconds} seconds before poking the farmer again.`,
      429,
      'DONATION_POKE_COOLDOWN',
    );
  }

  const table = session.kind === 'claim' ? 'donation_claims' : 'donations';
  const arrivalNotifiedAt = new Date(
    Math.max(now, (previousPokeTime ?? 0) + 1),
  ).toISOString();
  let updateQuery = supabaseAdmin
    .from(table)
    .update({ arrival_notified_at: arrivalNotifiedAt })
    .eq('id', record.id);
  updateQuery = record.arrival_notified_at
    ? updateQuery.eq('arrival_notified_at', record.arrival_notified_at)
    : updateQuery.is('arrival_notified_at', null);
  const { data: updated, error } = await updateQuery.select('*').maybeSingle();
  checkError(error);
  if (!updated) {
    throw new ApiError('The farmer was just poked. Please wait a minute before trying again.', 429, 'DONATION_POKE_COOLDOWN');
  }

  const notificationCreated = await createNotification({
    userId: session.farmerId,
    type: 'donation',
    title: FARMER_ARRIVAL_NOTIFICATION_TITLE,
    message: FARMER_ARRIVAL_NOTIFICATION_MESSAGE,
    link: '/farmer-donations',
  });
  if (!notificationCreated) {
    const { error: rollbackError } = await supabaseAdmin
      .from(table)
      .update({ arrival_notified_at: previousArrivalNotificationAt })
      .eq('id', record.id)
      .eq('arrival_notified_at', arrivalNotifiedAt);
    checkError(rollbackError);
    throw new ApiError('Unable to notify the farmer right now. Please try again.', 503);
  }

  const serialized = session.kind === 'claim'
    ? serializeClaim({ ...record, ...updated })
    : serializeDonation({ ...record, ...updated });
  emitDonationTrackingUpdate(record.id, 'donation-status-update', serialized);
  if (session.kind === 'claim') {
    emitDonationTrackingUpdate(session.donation.id, 'donation-status-update', serialized);
  }
  res.json({ notified: true, alreadyNotified: false, arrivalNotifiedAt });
}

export async function confirmDonationHandover(req, res) {
  const session = await resolveDonationTrackingSession(req);
  const { isFarmer } = assertTrackingSessionParty(req, session);
  if (!isFarmer) {
    throw new ApiError('Only the donating farmer can confirm donation handover.', 403);
  }

  const record = session.record;
  if (record.status === 'completed' || record.pickup_status === 'confirmed') {
    throw new ApiError('Donation handover has already been confirmed.', 409);
  }
  if (record.status !== 'scheduled') {
    throw new ApiError('Only accepted and scheduled donations can be confirmed.', 409);
  }

  const stakeholderReportedArrival = Boolean(record.arrival_notified_at);
  if (!stakeholderReportedArrival) {
    throw new ApiError(
      'The Stakeholder must poke the farmer to request handover confirmation first.',
      409,
    );
  }

  const confirmedAt = new Date().toISOString();
  let updatedRecord = null;

  if (typeof supabaseAdmin.rpc === 'function') {
    const rpcResult = await supabaseAdmin.rpc('confirm_surplus_donation_handover', {
      actor_id: req.profile.id,
      target_donation_id: session.donation.id,
      target_claim_id: session.claim ? session.claim.id : null,
    });
    if (!rpcResult?.error && rpcResult?.data) {
      updatedRecord = rpcResult.data;
    } else if (
      rpcResult?.error &&
      !['42883', 'PGRST202', 'PGRST205'].includes(rpcResult.error.code)
    ) {
      checkError(rpcResult.error);
    }
  }

  if (!updatedRecord) {
    const table = session.kind === 'claim' ? 'donation_claims' : 'donations';
    const baseUpdate = {
      status: 'completed',
      current_lat: null,
      current_lng: null,
      location_updated_at: null,
      updated_at: confirmedAt,
    };
    const enrichedUpdate = {
      ...baseUpdate,
      pickup_status: 'confirmed',
      confirmed_at: confirmedAt,
      current_accuracy: null,
      current_heading: null,
      current_speed: null,
    };

    let { data: updated, error: updateError } = await supabaseAdmin
      .from(table)
      .update(enrichedUpdate)
      .eq('id', record.id)
      .eq('status', 'scheduled')
      .select('*')
      .maybeSingle();

    if (updateError?.code === 'PGRST204' || updateError?.code === '42703') {
      ({ data: updated, error: updateError } = await supabaseAdmin
        .from(table)
        .update(baseUpdate)
        .eq('id', record.id)
        .eq('status', 'scheduled')
        .select('*')
        .maybeSingle());
    }
    checkError(updateError);
    if (!updated) {
      throw new ApiError('Donation handover has already been confirmed.', 409);
    }
    updatedRecord = {
      ...record,
      ...enrichedUpdate,
      ...updated,
    };

    if (session.stakeholderId) {
      const qty = session.claim ? session.claim.quantity : session.donation.quantity;
      await createNotification({
        userId: session.stakeholderId,
        type: 'donation',
        title: 'Donation Confirmed',
        message: `${session.donation.farmer_name} confirmed the handover of ${qty} ${session.donation.unit} of ${session.donation.product_name}.`,
        link: '/stakeholder-requests',
      });
    }
  }

  const serialized =
    session.kind === 'claim'
      ? serializeClaim(updatedRecord)
      : serializeDonation(updatedRecord);

  emitDonationTrackingUpdate(record.id, 'donation-status-update', serialized);
  emitDonationTrackingUpdate(record.id, 'sharer-status', {
    orderId: record.id,
    status: 'offline',
    at: confirmedAt,
  });
  if (session.kind === 'claim') {
    emitDonationTrackingUpdate(session.donation.id, 'donation-status-update', serialized);
  }

  res.json(serialized);
}
