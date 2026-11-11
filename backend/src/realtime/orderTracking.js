import { Server } from 'socket.io';
import { supabaseAdmin } from '../lib/supabaseClient.js';
import { createNotification } from '../lib/notify.js';
import { haversineKm, resolveDeliveryDestination } from '../lib/geo.js';
import { accumulateTripTelemetry } from '../lib/tripTelemetry.js';
import { assertAccountActive } from '../lib/accountInactivity.js';
import {
  evaluateDonationArrival,
} from '../lib/donationArrival.js';
import { getMunicipalityCoords } from '../utils/constants.js';

const ROOM_PREFIX = 'order:';
const DONATION_ROOM_PREFIX = 'donation:';
const NEAR_DESTINATION_KM = 0.5;
const VALID_SHARER_STATUSES = new Set(['online', 'offline', 'reconnecting', 'gps-lost']);

const notifiedNearOrders = new Set();
let activeIo = null;

export function emitDonationTrackingUpdate(targetId, eventName, payload) {
  if (!activeIo || !targetId) return;
  activeIo.to(ROOM_PREFIX + targetId).emit(eventName, payload);
  activeIo.to(DONATION_ROOM_PREFIX + targetId).emit(eventName, payload);
}

function isValidCoordinate(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  return true;
}

async function verifyAuthenticatedProfile(token) {
  if (!token) return null;
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData?.user) return null;

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id, role, account_status, last_active_at, created_at, inactivity_suspended_at')
    .eq('id', userData.user.id)
    .single();
  if (!profile) return null;
  try { await assertAccountActive(profile); } catch { return null; }
  return profile;
}

async function findDonationSession(targetId) {
  if (!targetId) return null;
  const { data: donation } = await supabaseAdmin
    .from('donations')
    .select('*')
    .eq('id', targetId)
    .maybeSingle();
  if (donation && donation.requested_by_id) {
    return { kind: 'donation', donation, claim: null, record: donation, stakeholderId: donation.requested_by_id, farmerId: donation.farmer_id };
  }

  const { data: claim } = await supabaseAdmin
    .from('donation_claims')
    .select('*')
    .eq('id', targetId)
    .maybeSingle();
  if (claim) {
    const { data: parentDonation } = await supabaseAdmin
      .from('donations')
      .select('*')
      .eq('id', claim.donation_id)
      .maybeSingle();
    if (parentDonation) {
      return { kind: 'claim', donation: parentDonation, claim, record: claim, stakeholderId: claim.stakeholder_id, farmerId: parentDonation.farmer_id };
    }
  }

  if (donation) {
    const { data: claims } = await supabaseAdmin
      .from('donation_claims')
      .select('*')
      .eq('donation_id', donation.id)
      .in('status', ['scheduled', 'completed']);
    const activeClaim = (claims || [])[0] || null;
    if (activeClaim) {
      return { kind: 'claim', donation, claim: activeClaim, record: activeClaim, stakeholderId: activeClaim.stakeholder_id, farmerId: donation.farmer_id };
    }
  }

  return null;
}

async function verifyOrderParty(token, orderId) {
  const profile = await verifyAuthenticatedProfile(token);
  if (!profile) return null;

  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single();
  if (!orderError && order) {
    if (order.buyer_id !== profile.id && order.farmer_id !== profile.id) return null;
    return { userId: profile.id, role: profile.role, order, donationSession: null };
  }

  // Support donation pickup tracking rooms for the donating Farmer and owning Stakeholder only.
  if (profile.role !== 'farmer' && profile.role !== 'stakeholder') return null;
  const session = await findDonationSession(orderId);
  if (!session) return null;
  if (session.farmerId !== profile.id && session.stakeholderId !== profile.id) return null;

  return {
    userId: profile.id,
    role: profile.role,
    order: null,
    donationSession: session,
  };
}

function isActiveMover(order, userId, donationSession = null) {
  if (donationSession) {
    const rec = donationSession.record;
    return (
      rec.status === 'scheduled' &&
      rec.pickup_status !== 'confirmed' &&
      rec.pickup_status !== 'cancelled' &&
      donationSession.stakeholderId === userId
    );
  }
  if (!order || order.status !== 'confirmed') return false;
  return (order.delivery_method === 'farmer_delivery' && order.delivery_status === 'out_for_delivery' && order.farmer_id === userId)
    || (order.delivery_method === 'buyer_pickup' && order.delivery_status === 'ready_for_pickup' && order.buyer_id === userId);
}

async function resolveFarmCoordinates(farmerId, fallbackLocation) {
  const { data: farmer } = await supabaseAdmin
    .from('profiles')
    .select('latitude, longitude, municipality')
    .eq('id', farmerId)
    .maybeSingle();
  if (farmer && Number.isFinite(Number(farmer.latitude)) && Number.isFinite(Number(farmer.longitude))) {
    return { lat: Number(farmer.latitude), lng: Number(farmer.longitude) };
  }
  return getMunicipalityCoords(farmer?.municipality || fallbackLocation);
}

export function setupOrderTrackingSocket(httpServer, allowedOrigins) {
  const io = new Server(httpServer, {
    cors: { origin: allowedOrigins },
    path: '/socket.io',
  });
  activeIo = io;

  io.on('connection', (socket) => {
    socket.on('join-order', async ({ orderId, token } = {}, ack) => {
      const verified = await verifyOrderParty(token, orderId);
      if (!verified) {
        ack?.({ ok: false, error: 'Not authorized to track this order.' });
        return;
      }
      socket.join(ROOM_PREFIX + orderId);
      if (verified.donationSession) {
        socket.join(DONATION_ROOM_PREFIX + orderId);
      }
      if (!socket.data.orderIds) socket.data.orderIds = new Set();
      socket.data.orderIds.add(orderId);
      socket.data.userId = verified.userId;
      const record = verified.order || verified.donationSession?.record;
      if (!socket.data.movingOrderIds) socket.data.movingOrderIds = new Set();
      if (isActiveMover(verified.order, verified.userId, verified.donationSession)) {
        socket.data.movingOrderIds.add(orderId);
      } else {
        socket.data.movingOrderIds.delete(orderId);
      }
      ack?.({
        ok: true,
        serverNow: Date.now(),
        location: record && record.current_lat != null && record.current_lng != null && record.location_updated_at ? {
          orderId,
          lat: Number(record.current_lat),
          lng: Number(record.current_lng),
          accuracy: record.current_accuracy,
          heading: record.current_heading,
          speed: record.current_speed,
          locationUpdatedAt: record.location_updated_at,
        } : null,
      });
    });

    socket.on('farmer-location', async ({ orderId, lat, lng, accuracy, heading, speed, timestamp, sampleAgeMs } = {}, ack) => {
      const receivedAt = Date.now();
      const ageMs = Number.isFinite(sampleAgeMs) && sampleAgeMs >= 0 ? sampleAgeMs : 0;
      if (ageMs > 180000 || (accuracy != null && (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 100))) {
        ack?.({ ok: false, error: 'A recent, accurate GPS sample is required.' });
        return;
      }
      const userId = socket.data.userId;
      if (!orderId || !socket.data.orderIds?.has(orderId) || !userId) {
        ack?.({ ok: false, error: 'Join the order room before sharing a location.' });
        return;
      }
      if (!isValidCoordinate(lat, lng)) {
        ack?.({ ok: false, error: 'A valid lat and lng are required.' });
        return;
      }

      const { data: order, error: orderError } = await supabaseAdmin
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .single();
      if (orderError || !order) {
        ack?.({ ok: false, error: 'Order was not found.' });
        return;
      }
      if (order.farmer_id !== userId) {
        ack?.({ ok: false, error: 'Only the farmer can share a live location.' });
        return;
      }
      if (order.delivery_method !== 'farmer_delivery') {
        ack?.({ ok: false, error: 'This order has no HarvestLink-tracked delivery location to share.' });
        return;
      }
      if (order.status !== 'confirmed' || order.delivery_status !== 'out_for_delivery') {
        ack?.({ ok: false, error: 'You can only share your location while the order is out for delivery.' });
        return;
      }

      const previousUpdatedAt = order.location_updated_at ? new Date(order.location_updated_at).getTime() : null;
      const sampleReceivedAt = ageMs === 0 && previousUpdatedAt != null && receivedAt <= previousUpdatedAt
        ? previousUpdatedAt + 1
        : receivedAt - ageMs;
      if (previousUpdatedAt != null && previousUpdatedAt >= sampleReceivedAt) {
        ack?.({ ok: true, skipped: true });
        return;
      }

      const locationUpdatedAt = new Date(sampleReceivedAt).toISOString();
      const baseUpdate = { current_lat: lat, current_lng: lng, location_updated_at: locationUpdatedAt };
      const enrichedUpdate = {
        ...baseUpdate,
        current_heading: Number.isFinite(heading) ? heading : null,
        current_speed: Number.isFinite(speed) ? speed : null,
        current_accuracy: Number.isFinite(accuracy) ? accuracy : null,
      };
      let previousOrder = order;
      let saved = null;
      let updateError = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const save = (update) => {
          let query = supabaseAdmin.from('orders').update(update).eq('id', orderId)
            .eq('status', 'confirmed').eq('delivery_status', 'out_for_delivery')
            .or(`location_updated_at.is.null,location_updated_at.lt.${locationUpdatedAt}`);
          query = previousOrder.location_updated_at
            ? query.eq('location_updated_at', previousOrder.location_updated_at)
            : query.is('location_updated_at', null);
          return query.select('id').maybeSingle();
        };
        const telemetry = accumulateTripTelemetry(previousOrder, { lat, lng, speed, accuracy }, locationUpdatedAt);
        ({ data: saved, error: updateError } = await save({ ...enrichedUpdate, ...telemetry }));
        if (updateError?.code === 'PGRST204' || updateError?.code === '42703') {
          ({ data: saved, error: updateError } = await save(enrichedUpdate));
        }
        if (updateError?.code === 'PGRST204' || updateError?.code === '42703') {
          ({ data: saved, error: updateError } = await save(baseUpdate));
        }
        if (saved || updateError) break;
        const latest = await supabaseAdmin.from('orders').select('*').eq('id', orderId).single();
        if (latest.error) { updateError = latest.error; break; }
        previousOrder = latest.data;
        if (!previousOrder || previousOrder.status !== 'confirmed' || previousOrder.delivery_status !== 'out_for_delivery'
          || Date.parse(previousOrder.location_updated_at) >= sampleReceivedAt) break;
      }
      if (updateError) {
        ack?.({ ok: false, error: updateError.message });
        return;
      }

      if (!saved) {
        ack?.({ ok: true, skipped: true });
        return;
      }

      io.to(ROOM_PREFIX + orderId).emit('location-update', {
        orderId,
        lat,
        lng,
        accuracy: Number.isFinite(accuracy) ? accuracy : null,
        heading: Number.isFinite(heading) ? heading : null,
        speed: Number.isFinite(speed) ? speed : null,
        locationUpdatedAt,
        timestamp: Number.isFinite(timestamp) ? timestamp : null,
        serverNow: Date.now(),
      });
      ack?.({ ok: true });

      if (!notifiedNearOrders.has(orderId)) {
        const destination = resolveDeliveryDestination({
          id: orderId,
          originMunicipality: order.origin_municipality,
          destinationMunicipality: order.delivery_municipality,
        });
        if (haversineKm({ lat, lng }, destination) <= NEAR_DESTINATION_KM) {
          notifiedNearOrders.add(orderId);
          await createNotification({
            userId: order.buyer_id,
            type: 'order',
            title: 'Your delivery is almost there',
            message: `${order.farmer_name} is less than 500m away.`,
            link: `/orders/${orderId}`,
          });
        }
      }
    });

    const handlePickupLocation = async ({ orderId, donationId, claimId, lat, lng, accuracy, heading, speed, timestamp } = {}, ack) => {
      const targetId = orderId || claimId || donationId;
      const receivedAt = Date.now();
      const userId = socket.data.userId;
      if (!targetId || !socket.data.orderIds?.has(targetId) || !userId) {
        ack?.({ ok: false, error: 'Join the order room before sharing a location.' });
        return;
      }
      if (!isValidCoordinate(lat, lng)) {
        ack?.({ ok: false, error: 'A valid lat and lng are required.' });
        return;
      }

      const { data: order, error: orderError } = await supabaseAdmin
        .from('orders')
        .select('farmer_id, buyer_id, buyer_name, delivery_method, status, delivery_status, origin_municipality, location_updated_at')
        .eq('id', targetId)
        .single();

      if (orderError || !order) {
        const session = await findDonationSession(targetId);
        if (!session) {
          ack?.({ ok: false, error: 'Order was not found.' });
          return;
        }
        if (session.stakeholderId !== userId) {
          ack?.({ ok: false, error: 'Only the requesting stakeholder can share a live pickup location.' });
          return;
        }
        const record = session.record;
        if (record.status !== 'scheduled' || record.pickup_status === 'confirmed' || record.pickup_status === 'cancelled') {
          ack?.({ ok: false, error: 'Donation pickup tracking is only active while scheduled.' });
          return;
        }
        const farmCoords = await resolveFarmCoordinates(session.farmerId, session.donation.location);
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
        let { error: updateError } = await supabaseAdmin.from(table).update(enrichedUpdate).eq('id', record.id);
        if (updateError?.code === 'PGRST204' || updateError?.code === '42703') {
          ({ error: updateError } = await supabaseAdmin.from(table).update(baseUpdate).eq('id', record.id));
        }
        if (updateError) {
          ack?.({ ok: false, error: updateError.message });
          return;
        }

        const payload = {
          orderId: targetId,
          donationId: session.donation.id,
          claimId: session.claim?.id || null,
          lat,
          lng,
          accuracy: Number.isFinite(accuracy) ? accuracy : null,
          heading: Number.isFinite(heading) ? heading : null,
          speed: Number.isFinite(speed) ? speed : null,
          locationUpdatedAt,
          timestamp: Number.isFinite(timestamp) ? timestamp : null,
          serverNow: Date.now(),
          pickupStatus: arrival.pickupStatus,
          arrived: arrival.arrived,
          arrivedAt: arrival.arrivedAt,
          isApproaching: arrival.isApproaching,
          distanceMeters: arrival.distanceMeters,
          consecutiveArrivalReadings: arrival.consecutiveArrivalReadings,
        };
        emitDonationTrackingUpdate(targetId, 'location-update', payload);
        emitDonationTrackingUpdate(targetId, 'donation-status-update', payload);

        if (arrival.newlyArrived) {
          emitDonationTrackingUpdate(targetId, 'donation-arrival', payload);
        }
        ack?.({ ok: true, arrival });
        return;
      }

      if (order.buyer_id !== userId) {
        ack?.({ ok: false, error: 'Only the buyer can share a live location.' });
        return;
      }
      if (order.delivery_method !== 'buyer_pickup') {
        ack?.({ ok: false, error: 'Only pickup orders have a pickup trip to share.' });
        return;
      }
      if (order.status !== 'confirmed' || order.delivery_status !== 'ready_for_pickup') {
        ack?.({ ok: false, error: 'You can only share your location once the order is ready for pickup.' });
        return;
      }

      if (order.location_updated_at && new Date(order.location_updated_at).getTime() > receivedAt) {
        ack?.({ ok: true, skipped: true });
        return;
      }

      const locationUpdatedAt = new Date().toISOString();
      const baseUpdate = { current_lat: lat, current_lng: lng, location_updated_at: locationUpdatedAt };
      const enrichedUpdate = {
        ...baseUpdate,
        current_heading: Number.isFinite(heading) ? heading : null,
        current_speed: Number.isFinite(speed) ? speed : null,
        current_accuracy: Number.isFinite(accuracy) ? accuracy : null,
      };
      let { error: updateError } = await supabaseAdmin.from('orders').update(enrichedUpdate).eq('id', targetId);

      if (updateError?.code === 'PGRST204' || updateError?.code === '42703') {
        ({ error: updateError } = await supabaseAdmin.from('orders').update(baseUpdate).eq('id', targetId));
      }
      if (updateError) {
        ack?.({ ok: false, error: updateError.message });
        return;
      }

      io.to(ROOM_PREFIX + targetId).emit('location-update', {
        orderId: targetId,
        lat,
        lng,
        accuracy: Number.isFinite(accuracy) ? accuracy : null,
        heading: Number.isFinite(heading) ? heading : null,
        speed: Number.isFinite(speed) ? speed : null,
        locationUpdatedAt,
        timestamp: Number.isFinite(timestamp) ? timestamp : null,
        serverNow: Date.now(),
      });
      ack?.({ ok: true });

      if (!notifiedNearOrders.has(`pickup:${targetId}`)) {
        const origin = resolveDeliveryDestination({
          id: targetId,
          originMunicipality: order.origin_municipality,
          destinationMunicipality: order.origin_municipality,
        });
        if (haversineKm({ lat, lng }, origin) <= NEAR_DESTINATION_KM) {
          notifiedNearOrders.add(`pickup:${targetId}`);
          await createNotification({
            userId: order.farmer_id,
            type: 'order',
            title: 'Buyer almost there',
            message: `${order.buyer_name} is less than 500m from pickup.`,
            link: `/orders/${targetId}`,
          });
        }
      }
    };

    socket.on('buyer-location', handlePickupLocation);
    socket.on('stakeholder-location', handlePickupLocation);

    socket.on('share-status', async ({ orderId, status } = {}) => {
      if (!orderId || !socket.data.orderIds?.has(orderId) || !VALID_SHARER_STATUSES.has(status)) return;
      const { data: order, error } = await supabaseAdmin.from('orders').select('*').eq('id', orderId).single();
      if (!error && order) {
        if (!socket.connected || !isActiveMover(order, socket.data.userId)) return;
        socket.data.movingOrderIds.add(orderId);
        io.to(ROOM_PREFIX + orderId).emit('sharer-status', { orderId, status, at: new Date().toISOString() });
        return;
      }
      const session = await findDonationSession(orderId);
      if (!socket.connected || !session || !isActiveMover(null, socket.data.userId, session)) return;
      socket.data.movingOrderIds.add(orderId);
      emitDonationTrackingUpdate(orderId, 'sharer-status', { orderId, status, at: new Date().toISOString() });
    });

    socket.on('disconnect', () => {
      if (!socket.data.movingOrderIds?.size) return;
      const at = new Date().toISOString();
      socket.data.movingOrderIds.forEach((orderId) => {
        const peers = io.sockets.adapter.rooms.get(ROOM_PREFIX + orderId) || [];
        if ([...peers].some((id) => io.sockets.sockets.get(id)?.data.movingOrderIds?.has(orderId))) return;
        io.to(ROOM_PREFIX + orderId).emit('sharer-status', { orderId, status: 'offline', at });
      });
    });
  });

  return io;
}
