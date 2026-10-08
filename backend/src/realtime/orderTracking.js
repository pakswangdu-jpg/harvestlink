import { Server } from 'socket.io';
import { supabaseAdmin } from '../lib/supabaseClient.js';
import { createNotification } from '../lib/notify.js';
import { haversineKm, resolveDeliveryDestination } from '../lib/geo.js';
import { accumulateTripTelemetry } from '../lib/tripTelemetry.js';









const ROOM_PREFIX = 'order:';
const NEAR_DESTINATION_KM = 0.5;
const VALID_SHARER_STATUSES = new Set(['online', 'offline', 'reconnecting', 'gps-lost']);




const notifiedNearOrders = new Set();






function isValidCoordinate(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  return true;
}

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
    .select('*')
    .eq('id', orderId)
    .single();
  if (orderError || !order) return null;
  if (order.buyer_id !== profile.id && order.farmer_id !== profile.id) return null;

  return { userId: profile.id, order };
}

function isActiveMover(order, userId) {
  if (order.status !== 'confirmed') return false;
  return (order.delivery_method === 'farmer_delivery' && order.delivery_status === 'out_for_delivery' && order.farmer_id === userId)
    || (order.delivery_method === 'buyer_pickup' && order.delivery_status === 'ready_for_pickup' && order.buyer_id === userId);
}

export function setupOrderTrackingSocket(httpServer, allowedOrigins) {
  const io = new Server(httpServer, {
    cors: { origin: allowedOrigins },
    path: '/socket.io',
  });

  io.on('connection', (socket) => {





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
      const order = verified.order;
      if (!socket.data.movingOrderIds) socket.data.movingOrderIds = new Set();
      if (isActiveMover(order, verified.userId)) socket.data.movingOrderIds.add(orderId);
      else socket.data.movingOrderIds.delete(orderId);
      ack?.({
        ok: true,
        serverNow: Date.now(),
        location: order.current_lat != null && order.current_lng != null && order.location_updated_at ? {
          orderId, lat: Number(order.current_lat), lng: Number(order.current_lng),
          accuracy: order.current_accuracy, heading: order.current_heading, speed: order.current_speed,
          locationUpdatedAt: order.location_updated_at,
        } : null,
      });
    });






    socket.on('farmer-location', async ({ orderId, lat, lng, accuracy, heading, speed, timestamp, sampleAgeMs } = {}, ack) => {



      const receivedAt = Date.now();
      // The device clock may differ from the server. Persist sample age on the
      // server clock, and preserve the original acquisition timestamp in realtime.
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




      const sampleReceivedAt = receivedAt - ageMs;
      if (order.location_updated_at && new Date(order.location_updated_at).getTime() >= sampleReceivedAt) {
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
          // Match the exact prior sample so concurrent updates cannot overwrite trip totals.
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






    socket.on('buyer-location', async ({ orderId, lat, lng, accuracy, heading, speed } = {}, ack) => {
      const receivedAt = Date.now();
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
        .select('farmer_id, buyer_id, buyer_name, delivery_method, status, delivery_status, origin_municipality, location_updated_at')
        .eq('id', orderId)
        .single();
      if (orderError || !order) {
        ack?.({ ok: false, error: 'Order was not found.' });
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
      let { error: updateError } = await supabaseAdmin.from('orders').update(enrichedUpdate).eq('id', orderId);

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





      if (!notifiedNearOrders.has(`pickup:${orderId}`)) {
        const origin = resolveDeliveryDestination({
          id: orderId,
          originMunicipality: order.origin_municipality,
          destinationMunicipality: order.origin_municipality,
        });
        if (haversineKm({ lat, lng }, origin) <= NEAR_DESTINATION_KM) {
          notifiedNearOrders.add(`pickup:${orderId}`);
          await createNotification({
            userId: order.farmer_id,
            type: 'order',
            title: 'Buyer almost there',
            message: `${order.buyer_name} is less than 500m from pickup.`,
            link: `/orders/${orderId}`,
          });
        }
      }
    });








    socket.on('share-status', async ({ orderId, status } = {}) => {
      if (!orderId || !socket.data.orderIds?.has(orderId) || !VALID_SHARER_STATUSES.has(status)) return;
      const { data: order, error } = await supabaseAdmin.from('orders').select('*').eq('id', orderId).single();
      if (!socket.connected || error || !order || !isActiveMover(order, socket.data.userId)) return;
      socket.data.movingOrderIds.add(orderId);
      io.to(ROOM_PREFIX + orderId).emit('sharer-status', { orderId, status, at: new Date().toISOString() });
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
