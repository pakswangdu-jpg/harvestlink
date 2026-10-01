import { supabaseAdmin } from '../lib/supabaseClient.js';
import { serializeDelivery, serializeOrder } from '../lib/serialize.js';
import { createNotification } from '../lib/notify.js';
import { getDeliverySequence } from '../lib/deliverySequence.js';
import { ApiError } from '../lib/ApiError.js';












async function fetchOrderOr404(orderId) {
  const { data, error } = await supabaseAdmin.from('orders').select('*').eq('id', orderId).single();
  if (error || !data) throw new ApiError('Order was not found.', 404);
  return data;
}

async function fetchDeliveryOr404(orderId) {
  const { data, error } = await supabaseAdmin.from('deliveries').select('*').eq('order_id', orderId).maybeSingle();
  if (error) throw new ApiError(error.message, 400);
  if (!data) throw new ApiError('No delivery has been booked for this order yet.', 404);
  return data;
}




function assertValidTrackingUrl(trackingUrl) {
  if (!trackingUrl?.trim()) throw new ApiError('Enter the Lalamove tracking link.', 400);
  if (!trackingUrl.trim().startsWith('https://')) throw new ApiError('The tracking URL must begin with https://.', 400);
}

function assertValidBookingReference(bookingReference) {
  if (bookingReference && bookingReference.trim().length > 100) {
    throw new ApiError('Booking reference must be 100 characters or fewer.', 400);
  }
}





const DELIVERY_NARRATION_SEQUENCE = ['booked', 'waiting_for_pickup', 'picked_up', 'delivered'];





export async function getDelivery(req, res) {
  const order = await fetchOrderOr404(req.params.orderId);
  const isParty = req.profile.id === order.buyer_id || req.profile.id === order.farmer_id || req.profile.role === 'admin';
  if (!isParty) throw new ApiError('You do not have permission to view this delivery.', 403);

  const { data, error } = await supabaseAdmin.from('deliveries').select('*').eq('order_id', order.id).maybeSingle();
  if (error) throw new ApiError(error.message, 400);
  res.json(serializeDelivery(data));
}






export async function bookDelivery(req, res) {
  const { orderId, driverName, vehicleType, bookingReference, trackingUrl, estimatedArrival } = req.body;
  if (!orderId) throw new ApiError('An order is required.', 400);

  const order = await fetchOrderOr404(orderId);
  if (req.profile.id !== order.farmer_id) throw new ApiError('You do not have permission to book delivery for this order.', 403);
  if (order.delivery_method !== 'courier') throw new ApiError('This order is not a third-party courier delivery.', 400);
  if (order.status !== 'confirmed') throw new ApiError('This order must be confirmed before booking a courier.', 400);

  const sequence = getDeliverySequence(order.delivery_method);
  const transitStatus = sequence[sequence.length - 2];
  const readyForCourierStatus = sequence[sequence.indexOf(transitStatus) - 1];
  if (order.delivery_status !== readyForCourierStatus) {
    throw new ApiError('This order must be packed and ready before booking a courier.', 400);
  }



  if (order.payment_method !== 'cod' && order.payment_status !== 'paid') {
    throw new ApiError('This order\'s payment must be verified before booking a courier.', 400);
  }

  assertValidTrackingUrl(trackingUrl);
  assertValidBookingReference(bookingReference);

  const deliveryRow = {
    order_id: order.id,



    courier_company: 'Lalamove',
    driver_name: driverName?.trim() || null,
    driver_phone: null,
    vehicle_type: vehicleType?.trim() || null,
    booking_reference: bookingReference?.trim() || null,
    tracking_url: trackingUrl.trim(),
    estimated_arrival: estimatedArrival?.trim() || null,
    delivery_status: 'booked',
  };

  const { data: delivery, error: deliveryError } = await supabaseAdmin
    .from('deliveries')
    .upsert(deliveryRow, { onConflict: 'order_id' })
    .select()
    .single();
  if (deliveryError) throw new ApiError(deliveryError.message, 400);

  const { data: updatedOrder, error: orderError } = await supabaseAdmin
    .from('orders')
    .update({ delivery_status: transitStatus, transit_started_at: new Date().toISOString() })
    .eq('id', order.id)
    .select()
    .single();
  if (orderError) throw new ApiError(orderError.message, 400);

  await createNotification({
    userId: order.buyer_id,
    type: 'order',
    title: 'Your order is now out for delivery',
    message: `Courier: ${deliveryRow.courier_company}.`
      + (deliveryRow.driver_name ? ` Driver: ${deliveryRow.driver_name}.` : '')
      + (deliveryRow.vehicle_type ? ` Vehicle: ${deliveryRow.vehicle_type}.` : '')
      + ' Tap "Track Delivery" to monitor your delivery.',
    link: `/orders/${order.id}`,
  });

  res.status(201).json({ order: serializeOrder(updatedOrder), delivery: serializeDelivery(delivery) });
}





export async function updateDelivery(req, res) {
  const order = await fetchOrderOr404(req.params.orderId);
  if (req.profile.id !== order.farmer_id) throw new ApiError('You do not have permission to edit this delivery.', 403);
  await fetchDeliveryOr404(order.id);

  const { driverName, vehicleType, bookingReference, trackingUrl, estimatedArrival } = req.body;
  assertValidTrackingUrl(trackingUrl);
  assertValidBookingReference(bookingReference);

  const { data: delivery, error } = await supabaseAdmin
    .from('deliveries')
    .update({
      driver_name: driverName?.trim() || null,
      vehicle_type: vehicleType?.trim() || null,
      booking_reference: bookingReference?.trim() || null,
      tracking_url: trackingUrl.trim(),
      estimated_arrival: estimatedArrival?.trim() || null,
    })
    .eq('order_id', order.id)
    .select()
    .single();
  if (error) throw new ApiError(error.message, 400);

  res.json(serializeDelivery(delivery));
}






export async function updateDeliveryStatus(req, res) {
  const order = await fetchOrderOr404(req.params.orderId);
  if (req.profile.id !== order.farmer_id) throw new ApiError('You do not have permission to update this delivery.', 403);
  const delivery = await fetchDeliveryOr404(order.id);

  const { status } = req.body;
  const currentIndex = DELIVERY_NARRATION_SEQUENCE.indexOf(delivery.delivery_status);
  const nextStatus = currentIndex === -1 ? null : DELIVERY_NARRATION_SEQUENCE[currentIndex + 1];
  if (!nextStatus || status !== nextStatus) {
    throw new ApiError(`This delivery's next status must be "${nextStatus || 'none — already delivered'}".`, 400);
  }

  const { data: updated, error } = await supabaseAdmin
    .from('deliveries')
    .update({ delivery_status: nextStatus })
    .eq('order_id', order.id)
    .select()
    .single();
  if (error) throw new ApiError(error.message, 400);

  res.json(serializeDelivery(updated));
}
