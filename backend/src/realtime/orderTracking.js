import { Server } from 'socket.io';
import { supabaseAdmin } from '../lib/supabaseClient.js';
import { createNotification } from '../lib/notify.js';
import { haversineKm, resolveDeliveryDestination } from '../lib/geo.js';









const ROOM_PREFIX = 'order:';
const NEAR_DESTINATION_KM = 0.5;
const VALID_SHARER_STATUSES = new Set(['online', 'offline', 'reconnecting', 'gps-lost']);




const notifiedNearOrders = new Set();






function isValidCoordinate(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  if (lat === 0 && lng === 0) return false;
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






    socket.on('farmer-location', async ({ orderId, lat, lng, accuracy, heading, speed } = {}, ack) => {



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
        .select('farmer_id, buyer_id, farmer_name, delivery_method, status, delivery_status, origin_municipality, delivery_municipality, location_updated_at')
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








    socket.on('share-status', ({ orderId, status } = {}) => {
      if (!orderId || !socket.data.orderIds?.has(orderId) || !VALID_SHARER_STATUSES.has(status)) return;
      io.to(ROOM_PREFIX + orderId).emit('sharer-status', { orderId, status, at: new Date().toISOString() });
    });







    socket.on('disconnect', () => {
      if (!socket.data.orderIds?.size) return;
      const at = new Date().toISOString();
      socket.data.orderIds.forEach((orderId) => {
        io.to(ROOM_PREFIX + orderId).emit('sharer-status', { orderId, status: 'offline', at });
      });
    });
  });

  return io;
}
