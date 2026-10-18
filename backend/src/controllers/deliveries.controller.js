import { supabaseAdmin } from '../lib/supabaseClient.js';
import { serializeDelivery, serializeOrder } from '../lib/serialize.js';
import { createNotification } from '../lib/notify.js';
import { ApiError } from '../lib/ApiError.js';
import { isOfficialLalamoveTrackingUrl } from '../../shared/lalamove.js';

async function fetchOrderOr404(orderId) {
  const { data, error } = await supabaseAdmin.from('orders').select('*').eq('id', orderId).single();
  if (error || !data) throw new ApiError('Order was not found.', 404);
  return data;
}

function assertFarmer(order, profile) {
  if (profile.role !== 'farmer' || profile.id !== order.farmer_id) {
    throw new ApiError('Only the farmer connected to this order can manage its courier.', 403);
  }
  if (order.delivery_method !== 'courier') throw new ApiError('This order is not a third-party courier delivery.', 400);
}

function optionalText(value, label, max) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || value.trim().length > max || /\p{Cc}/u.test(value)) {
    throw new ApiError(`${label} must be text of ${max} characters or fewer.`, 400);
  }
  return value.trim() || null;
}

function bookingDetails(body) {
  const bookingReference = optionalText(body.bookingReference, 'Booking number', 100);
  if (!bookingReference) throw new ApiError('Enter the Lalamove booking number.', 400);
  if (!isOfficialLalamoveTrackingUrl(body.trackingUrl)) {
    throw new ApiError('Enter a valid official HTTPS Lalamove tracking/share link.', 400);
  }
  const plate = optionalText(body.vehiclePlate, 'Vehicle plate', 15);
  if (plate && !/^[A-Za-z0-9 -]+$/.test(plate)) throw new ApiError('Enter a valid vehicle plate.', 400);
  return {
    booking_reference: bookingReference, tracking_url: body.trackingUrl.trim(),
    driver_name: optionalText(body.driverName, 'Driver name', 120),
    vehicle_plate_number: plate?.toUpperCase() || null,
  };
}

async function manageCourier(profile, order, action, details = {}) {
  assertFarmer(order, profile);
  const { data, error } = await supabaseAdmin.rpc('manage_manual_courier', {
    p_actor: profile.id, p_order: order.id, p_action: action, p_details: details,
  });
  if (error) {
    if (['PGRST202', '42883', '42703'].includes(error.code)) {
      throw new ApiError('Courier setup requires the latest database migration. Please contact support.', 503);
    }
    throw new ApiError(error.message, error.code === '42501' ? 403 : error.code === 'P0002' ? 404 : 409);
  }
  return data;
}

export async function getDelivery(req, res) {
  const order = await fetchOrderOr404(req.params.orderId);
  if (req.profile.id !== order.buyer_id && req.profile.id !== order.farmer_id && req.profile.role !== 'admin') {
    throw new ApiError('You do not have permission to view this delivery.', 403);
  }
  const { data, error } = await supabaseAdmin.from('deliveries').select('*').eq('order_id', order.id).maybeSingle();
  if (error) throw new ApiError(error.message, 400);
  res.json(serializeDelivery(data));
}

export async function bookDelivery(req, res) {
  if (typeof req.body?.orderId !== 'string' || !req.body.orderId) throw new ApiError('An order is required.', 400);
  const order = await fetchOrderOr404(req.body.orderId);
  assertFarmer(order, req.profile);
  const saved = await manageCourier(req.profile, order, 'book', bookingDetails(req.body));
  await createNotification({
    userId: order.buyer_id, type: 'order', title: 'Lalamove courier booked',
    message: 'Your order has been booked with Lalamove. Tracking details are now available.', link: `/orders/${order.id}`,
  });
  res.status(201).json({ order: serializeOrder(saved.order), delivery: serializeDelivery(saved.delivery) });
}

export async function updateDelivery(req, res) {
  const order = await fetchOrderOr404(req.params.orderId);
  assertFarmer(order, req.profile);
  const saved = await manageCourier(req.profile, order, 'edit', bookingDetails(req.body || {}));
  res.json(serializeDelivery(saved.delivery));
}

export async function updateDeliveryStatus(req, res) {
  const order = await fetchOrderOr404(req.params.orderId);
  assertFarmer(order, req.profile);
  if (req.body?.status !== 'out_for_delivery') {
    throw new ApiError('Confirm courier handover to start delivery. The buyer confirms receipt using the existing order process.', 400);
  }
  const saved = await manageCourier(req.profile, order, 'handover');
  await createNotification({
    userId: order.buyer_id, type: 'order', title: 'Order is out for delivery',
    message: 'Your order has been handed to Lalamove. Use the official tracking link to follow the delivery.', link: `/orders/${order.id}`,
  });
  res.json({ order: serializeOrder(saved.order), delivery: serializeDelivery(saved.delivery) });
}
