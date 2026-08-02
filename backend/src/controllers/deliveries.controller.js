import { supabaseAdmin } from '../lib/supabaseClient.js';
import { serializeDelivery, serializeOrder } from '../lib/serialize.js';
import { createNotification } from '../lib/notify.js';
import { getDeliverySequence } from '../lib/deliverySequence.js';
import { ApiError } from '../lib/ApiError.js';

// ============================================================================
// Third-party courier (Lalamove) delivery coordination — a `courier`-method order's
// equivalent of the farmer's own GPS sharing (farmer_delivery) or the buyer's own GPS
// sharing (buyer_pickup). HarvestLink never implements courier GPS tracking of any kind:
// the farmer books the actual delivery on Lalamove's own site/app (outside this system
// entirely), then records the resulting driver/vehicle/tracking-link details here so the
// buyer can see them and follow the tracking_url to Lalamove's own official tracking page.
// Nothing here ever polls, scrapes, or embeds Lalamove — tracking_url is opened directly by
// the buyer's browser in a new tab (see src/components/orders/DeliveryInfoCard.jsx).
// ============================================================================

async function fetchOrderOr404(orderId) {
  const { data, error } = await supabaseAdmin.from('orders').select('*').eq('id', orderId).single();
  if (error || !data) throw new ApiError('Order was not found.', 404);
  return data;
}

// GET /api/deliveries/:orderId — either party on the order can read the booking details
// once they exist (buyer to see/track it, farmer to see what they already booked). Returns
// null (not 404) when no delivery has been booked yet — "not booked yet" is a normal,
// expected state for this endpoint, not an error.
export async function getDelivery(req, res) {
  const order = await fetchOrderOr404(req.params.orderId);
  const isParty = req.profile.id === order.buyer_id || req.profile.id === order.farmer_id || req.profile.role === 'admin';
  if (!isParty) throw new ApiError('You do not have permission to view this delivery.', 403);

  const { data, error } = await supabaseAdmin.from('deliveries').select('*').eq('order_id', order.id).maybeSingle();
  if (error) throw new ApiError(error.message, 400);
  res.json(serializeDelivery(data));
}

// POST /api/deliveries — farmer-only. Records the Lalamove booking the farmer just
// completed externally, and this IS the courier order's "packed -> out for delivery" step
// (replacing the generic PATCH /orders/:id/advance-delivery action for this one delivery
// method — see FarmerOrders.jsx / OrderTracking.jsx, which show "Book Lalamove Delivery"
// instead of the generic "Mark Out for delivery" button at this exact point).
export async function bookDelivery(req, res) {
  const { orderId, courierCompany, driverName, driverPhone, vehicleType, bookingReference, trackingUrl, estimatedArrival } = req.body;
  if (!orderId) throw new ApiError('An order is required.', 400);

  const order = await fetchOrderOr404(orderId);
  if (req.profile.id !== order.farmer_id) throw new ApiError('You do not have permission to book delivery for this order.', 403);
  if (order.delivery_method !== 'courier') throw new ApiError('This order is not a third-party courier delivery.', 400);
  if (order.status !== 'confirmed') throw new ApiError('This order must be confirmed before booking a courier.', 400);

  const sequence = getDeliverySequence(order.delivery_method);
  const transitStatus = sequence[sequence.length - 2]; // 'out_for_delivery'
  const readyForCourierStatus = sequence[sequence.indexOf(transitStatus) - 1]; // 'packed'
  if (order.delivery_status !== readyForCourierStatus) {
    throw new ApiError('This order must be packed and ready before booking a courier.', 400);
  }
  // Same "payment settled before the physical handoff" gate as the rest of the app — a COD
  // order is paid at the door (so it's never "verified" in advance, see
  // payments.controller.js), but a GCash order must have cleared farmer verification first.
  if (order.payment_method !== 'cod' && order.payment_status !== 'paid') {
    throw new ApiError('This order\'s payment must be verified before booking a courier.', 400);
  }

  if (!driverName?.trim()) throw new ApiError('Enter the driver\'s name.', 400);
  if (!driverPhone?.trim()) throw new ApiError('Enter the driver\'s contact number.', 400);
  if (!trackingUrl?.trim()) throw new ApiError('Enter the Lalamove tracking link.', 400);

  const deliveryRow = {
    order_id: order.id,
    courier_company: courierCompany?.trim() || 'Lalamove',
    driver_name: driverName.trim(),
    driver_phone: driverPhone.trim(),
    vehicle_type: vehicleType?.trim() || null,
    booking_reference: bookingReference?.trim() || null,
    tracking_url: trackingUrl.trim(),
    estimated_arrival: estimatedArrival?.trim() || null,
    delivery_status: 'out_for_delivery',
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
    message: `Courier: ${deliveryRow.courier_company}. Driver: ${deliveryRow.driver_name}.`
      + (deliveryRow.vehicle_type ? ` Vehicle: ${deliveryRow.vehicle_type}.` : '')
      + ' Tap "Track Delivery" to monitor your delivery.',
    link: `/orders/${order.id}`,
  });

  res.status(201).json({ order: serializeOrder(updatedOrder), delivery: serializeDelivery(delivery) });
}
