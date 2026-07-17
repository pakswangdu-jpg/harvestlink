import { Server } from 'socket.io';
import { supabaseAdmin } from '../lib/supabaseClient.js';
import { createNotification } from '../lib/notify.js';
import { haversineKm, resolveDeliveryDestination } from '../lib/geo.js';

// Grab-like live GPS broadcast layer, purely additive alongside the existing REST
// PATCH /orders/:id/location endpoint (backend/src/controllers/orders.controller.js —
// untouched, still works exactly as before). This gives sub-second fan-out to anyone
// watching an order's live tracking view instead of waiting for the next poll/Realtime
// tick. Persists to the SAME orders columns the REST endpoint already uses
// (current_lat/current_lng/location_updated_at) — no schema change, no shared code path
// with the existing controller (kept fully independent so this can never alter its
// behavior).
const ROOM_PREFIX = 'order:';
const NEAR_DESTINATION_KM = 0.5;

// One-shot guard so a farmer idling within 500m doesn't get a fresh notification on every
// 3-5s tick — a per-process Set is enough here (not persisted): worst case after a server
// restart is a single duplicate "almost there" notification, never a missed one.
const notifiedNearOrders = new Set();

async function verifyOrderParty(token, orderId) {
  if (!token) return null;
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData?.user) return null;

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id, account_status')
    .eq('id', userData.user.id)
    .single();
  if (!profile || profile.account_status === 'suspended') return null;

  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .select('id, buyer_id, farmer_id')
    .eq('id', orderId)
    .single();
  if (orderError || !order) return null;
  if (order.buyer_id !== profile.id && order.farmer_id !== profile.id) return null;

  return { userId: profile.id };
}

export function setupOrderTrackingSocket(httpServer, allowedOrigins) {
  const io = new Server(httpServer, {
    cors: { origin: allowedOrigins },
    path: '/socket.io',
  });

  io.on('connection', (socket) => {
    // Verified once here (checks the token + order membership against the DB); every
    // later event on this socket just trusts socket.data.userId instead of re-verifying
    // the JWT on every single GPS tick a few seconds apart. A single socket can join more
    // than one order's room — a farmer with two deliveries out at once shares one real
    // device position to both, so this is a Set, not a single value.
    socket.on('join-order', async ({ orderId, token } = {}, ack) => {
      const verified = await verifyOrderParty(token, orderId);
      if (!verified) {
        ack?.({ ok: false, error: 'Not authorized to track this order.' });
        return;
      }
      socket.join(ROOM_PREFIX + orderId);
      if (!socket.data.orderIds) socket.data.orderIds = new Set();
      socket.data.orderIds.add(orderId);
      socket.data.userId = verified.userId;
      ack?.({ ok: true });
    });

    // Farmer-only, and only while the order is genuinely out for delivery — re-checked
    // fresh against the DB on every update (not cached), since status/method can change
    // mid-delivery (e.g. the buyer cancels) and a stale cached check could miss that.
    // `orderId` is required in the payload (not inferred from a single joined room) since
    // one socket may be sharing to several active orders at once.
    socket.on('farmer-location', async ({ orderId, lat, lng, accuracy, heading, speed } = {}, ack) => {
      const userId = socket.data.userId;
      if (!orderId || !socket.data.orderIds?.has(orderId) || !userId) {
        ack?.({ ok: false, error: 'Join the order room before sharing a location.' });
        return;
      }
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        ack?.({ ok: false, error: 'A valid lat and lng are required.' });
        return;
      }

      const { data: order, error: orderError } = await supabaseAdmin
        .from('orders')
        .select('farmer_id, buyer_id, farmer_name, delivery_method, status, delivery_status, origin_municipality, delivery_municipality')
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
      if (order.delivery_method === 'buyer_pickup') {
        ack?.({ ok: false, error: 'Pickup orders have no delivery location to share.' });
        return;
      }
      if (order.status !== 'confirmed' || order.delivery_status !== 'out_for_delivery') {
        ack?.({ ok: false, error: 'You can only share your location while the order is out for delivery.' });
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
      let { error: updateError } = await supabaseAdmin.from('orders').update(enrichedUpdate).eq('id', orderId);
      // PGRST204 = PostgREST's "column not in schema cache" (what Supabase's client actually
      // returns for an unknown column — raw Postgres's own 42703 undefined_column never
      // surfaces through it) — the current_heading/current_speed/current_accuracy migration
      // (see supabase/schema.sql) hasn't been run against this database yet. Falls back to the
      // base fields so location sharing itself never breaks waiting on that; the enriched
      // columns just silently stay unpopulated until the migration lands.
      if (updateError?.code === 'PGRST204' || updateError?.code === '42703') {
        ({ error: updateError } = await supabaseAdmin.from('orders').update(baseUpdate).eq('id', orderId));
      }
      if (updateError) {
        ack?.({ ok: false, error: updateError.message });
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
  });

  return io;
}
