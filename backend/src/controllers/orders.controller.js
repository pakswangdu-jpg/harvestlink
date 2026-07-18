import { supabaseAdmin } from '../lib/supabaseClient.js';
import { serializeOrder } from '../lib/serialize.js';
import { createNotification } from '../lib/notify.js';
import { reduceProductQuantity, restoreProductQuantity } from './products.controller.js';
import { getDeliverySequence, getNextDeliveryStatus, isCancellable } from '../lib/deliverySequence.js';
import { matchMunicipality } from '../lib/geo.js';
import { calculateDeliveryFee } from '../lib/deliveryFee.js';
import { PAYMENT_METHODS } from '../utils/constants.js';
import { ApiError } from '../lib/ApiError.js';

async function fetchOrderOr404(id) {
  const { data, error } = await supabaseAdmin.from('orders').select('*').eq('id', id).single();
  if (error || !data) throw new ApiError('Order was not found.', 404);
  return data;
}

function assertParty(req, order) {
  const isAdmin = req.profile.role === 'admin';
  const isBuyer = req.profile.id === order.buyer_id;
  const isFarmer = req.profile.id === order.farmer_id;
  if (!isAdmin && !isBuyer && !isFarmer) throw new ApiError('You do not have permission to view this order.', 403);
  return { isAdmin, isBuyer, isFarmer };
}

// GET /api/orders?buyerId=&farmerId= — non-admin callers are server-forced to their own
// orders (as buyer OR farmer) regardless of query params; only an admin gets everything.
export async function listOrders(req, res) {
  let query = supabaseAdmin.from('orders').select('*').order('created_at', { ascending: false });

  if (req.profile.role === 'admin') {
    if (req.query.buyerId) query = query.eq('buyer_id', req.query.buyerId);
    if (req.query.farmerId) query = query.eq('farmer_id', req.query.farmerId);
  } else {
    query = query.or(`buyer_id.eq.${req.profile.id},farmer_id.eq.${req.profile.id}`);
  }

  const { data, error } = await query;
  if (error) throw new ApiError(error.message, 400);
  res.json(data.map(serializeOrder));
}

export async function getOrder(req, res) {
  const order = await fetchOrderOr404(req.params.id);
  assertParty(req, order);
  res.json(serializeOrder(order));
}

// POST /api/orders — mirrors createOrder(): resolves the product, snapshots
// farmer/buyer names + unit price, derives municipalities, inserts, notifies the farmer.
// Any authenticated non-admin role may place an order (a stakeholder checking out through
// the marketplace is a "buyer" by ID ownership, same as a buyer-role account).
export async function createOrder(req, res) {
  if (req.profile.role === 'admin') throw new ApiError('Admin accounts cannot place orders.', 403);

  const values = req.body;
  const { data: product, error: productError } = await supabaseAdmin
    .from('products')
    .select('*')
    .eq('id', values.productId)
    .single();
  if (productError || !product) throw new ApiError('Product was not found.', 404);
  if (product.farmer_id === req.profile.id) throw new ApiError('You cannot order your own product.', 400);
  if (product.status !== 'active') throw new ApiError('This product is no longer available.', 400);
  // Not shown in the marketplace while its price is under DTI review (see listProducts) —
  // block ordering it directly too, e.g. via a stale link, not just hide it from browsing.
  if (product.price_review?.status === 'pending') {
    throw new ApiError('This product is awaiting DTI price review and cannot be ordered yet.', 400);
  }

  const quantity = Number(values.quantity);
  if (!(quantity > 0)) throw new ApiError('Enter a positive request quantity.', 400);
  if (quantity > Number(product.quantity)) throw new ApiError(`Only ${product.quantity} ${product.unit} available.`, 400);
  if (!PAYMENT_METHODS.includes(values.paymentMethod)) throw new ApiError('Choose a valid payment method.', 400);

  const { data: farmer } = await supabaseAdmin.from('profiles').select('name').eq('id', product.farmer_id).single();

  const originMunicipality = matchMunicipality(product.location);
  const deliveryMunicipality = values.deliveryMethod === 'buyer_pickup' ? originMunicipality : values.deliveryMunicipality;
  // Computed server-side, never trusted from the client — a buyer could otherwise submit
  // any fee they like alongside a real distance. See lib/deliveryFee.js for the actual
  // road-distance + configurable-tier calculation.
  const {
    fee: deliveryFee,
    distanceKm: deliveryDistanceKm,
    durationMinutes: deliveryDurationMinutes,
    tierLabel: deliveryFeeTier,
  } = await calculateDeliveryFee(originMunicipality, deliveryMunicipality, values.deliveryMethod);
  const now = new Date().toISOString();

  const row = {
    product_id: product.id,
    product_name: product.name,
    unit: product.unit,
    unit_price: Number(product.price),
    // Snapshotted so profit stays accurate for this order even if the farmer later edits
    // or removes their recorded cost (see reportService.js's getTotalProfit).
    unit_cost_price: product.cost_price == null ? null : Number(product.cost_price),
    farmer_id: product.farmer_id,
    farmer_name: farmer?.name || 'Local farmer',
    buyer_id: req.profile.id,
    buyer_name: req.profile.name,
    quantity,
    delivery_fee: deliveryFee,
    // Snapshotted alongside the fee itself — see the Smart Distance-Based Delivery Fee
    // System (lib/deliveryFee.js) — so a placed order's breakdown stays exactly reproducible
    // even if the road distance or pricing tiers change later.
    delivery_distance_km: deliveryDistanceKm,
    delivery_duration_minutes: deliveryDurationMinutes,
    delivery_fee_tier: deliveryFeeTier,
    total_amount: quantity * Number(product.price) + deliveryFee,
    message: values.message?.trim() || '',
    payment_method: values.paymentMethod,
    // GCash starts pending too, same as COD — it only becomes 'paid' once the buyer
    // completes the demo GCash payment flow (see payments.controller.js), not automatically
    // here at order creation.
    payment_status: 'pending',
    delivery_method: values.deliveryMethod,
    delivery_status: 'pending',
    origin_municipality: originMunicipality,
    delivery_municipality: deliveryMunicipality,
    status: 'pending',
    created_at: now,
    updated_at: now,
  };

  const { data: order, error } = await supabaseAdmin.from('orders').insert(row).select().single();
  if (error) throw new ApiError(error.message, 400);

  await createNotification({
    userId: order.farmer_id,
    type: 'order',
    title: 'New order received',
    message: `${order.buyer_name} ordered ${order.quantity} ${order.unit} of ${order.product_name}.`,
    link: `/orders/${order.id}`,
  });

  res.status(201).json(serializeOrder(order));
}

// PATCH /api/orders/:id/status — body { status: 'confirmed' | 'rejected' }.
export async function updateOrderStatus(req, res) {
  const existing = await fetchOrderOr404(req.params.id);
  if (req.profile.id !== existing.farmer_id) throw new ApiError('You do not have permission to modify this order.', 403);
  if (existing.status !== 'pending') throw new ApiError('This order has already been reviewed.', 400);

  const { status } = req.body;
  if (!['confirmed', 'rejected'].includes(status)) throw new ApiError('Invalid order status.', 400);

  if (status === 'confirmed') {
    await reduceProductQuantity(existing.product_id, existing.quantity);
  }

  const { data: order, error } = await supabaseAdmin
    .from('orders')
    .update({ status })
    .eq('id', existing.id)
    .select()
    .single();
  if (error) throw new ApiError(error.message, 400);

  await createNotification({
    userId: order.buyer_id,
    type: 'order',
    title: status === 'confirmed' ? 'Order confirmed' : 'Order rejected',
    message: status === 'confirmed'
      ? `${order.farmer_name} confirmed your order for ${order.product_name}.`
      : `${order.farmer_name} rejected your order for ${order.product_name}.`,
    link: `/orders/${order.id}`,
  });

  res.json(serializeOrder(order));
}

export async function cancelOrder(req, res) {
  const existing = await fetchOrderOr404(req.params.id);
  if (req.profile.id !== existing.buyer_id) throw new ApiError('You do not have permission to cancel this order.', 403);
  if (!isCancellable(existing)) throw new ApiError('This order can no longer be cancelled.', 400);

  if (existing.status === 'confirmed') {
    await restoreProductQuantity(existing.product_id, existing.quantity);
  }

  const { data: order, error } = await supabaseAdmin
    .from('orders')
    .update({ status: 'cancelled', delivery_status: 'cancelled', current_lat: null, current_lng: null, location_updated_at: null })
    .eq('id', existing.id)
    .select()
    .single();
  if (error) throw new ApiError(error.message, 400);
  res.json(serializeOrder(order));
}

export async function advanceDelivery(req, res) {
  const existing = await fetchOrderOr404(req.params.id);
  const isBuyer = req.profile.id === existing.buyer_id;
  const isFarmer = req.profile.id === existing.farmer_id;
  if (!isBuyer && !isFarmer) throw new ApiError('You do not have permission to modify this order.', 403);
  if (existing.status !== 'confirmed') throw new ApiError('Only confirmed orders can be advanced.', 400);

  const nextStatus = getNextDeliveryStatus(existing);
  if (!nextStatus) throw new ApiError('This order has already reached its final delivery step.', 400);

  const sequence = getDeliverySequence(existing.delivery_method);
  const isFinalStep = nextStatus === sequence[sequence.length - 1];
  // Buyer pickup has no delivery leg — the buyer travels there on their own schedule, so
  // there's no live-location step to anchor (see getLiveTransitProgress on the frontend,
  // which excludes buyer_pickup from "in transit" the same way).
  const isTransitStep = existing.delivery_method !== 'buyer_pickup' && nextStatus === sequence[sequence.length - 2];

  // The final step (delivered/picked up) is confirmed by the BUYER via "Got it" — only they
  // know the moment they actually receive it in hand. Every earlier step is the FARMER
  // reporting their own prep/shipping progress. See OrderTracking.jsx for the matching
  // frontend gate that decides which role even sees a button for this action.
  if (isFinalStep && !isBuyer) throw new ApiError('Only the buyer can confirm the order was received.', 403);
  if (!isFinalStep && !isFarmer) throw new ApiError('Only the farmer can update delivery progress.', 403);

  const row = {
    delivery_status: nextStatus,
    status: isFinalStep ? 'completed' : existing.status,
    payment_status: isFinalStep && existing.payment_method === 'cod' ? 'paid' : existing.payment_status,
    ...(isTransitStep ? { transit_started_at: new Date().toISOString() } : null),
    // The live GPS dot only makes sense while the order is actually in transit — clear it
    // once delivered so a stale position never lingers on a finished order.
    ...(isFinalStep ? { current_lat: null, current_lng: null, location_updated_at: null } : null),
  };

  const { data: order, error } = await supabaseAdmin.from('orders').update(row).eq('id', existing.id).select().single();
  if (error) throw new ApiError(error.message, 400);

  if (isTransitStep) {
    await createNotification({
      userId: order.buyer_id,
      type: 'order',
      title: 'Your order is on the way',
      message: `${order.farmer_name} started delivering your order.`,
      link: `/orders/${order.id}`,
    });
  }
  if (isFinalStep) {
    const isPickup = order.delivery_method === 'buyer_pickup';
    await createNotification({
      userId: order.buyer_id,
      type: 'order',
      title: isPickup ? 'Pickup confirmed' : 'Order delivered',
      message: isPickup
        ? `You confirmed picking up your order from ${order.farmer_name}.`
        : `Your order from ${order.farmer_name} has been delivered.`,
      link: `/orders/${order.id}`,
    });
  }

  res.json(serializeOrder(order));
}

// PATCH /api/orders/:id/location — body { lat, lng }. Farmer-only, and only while the order
// is actually out for delivery — this is what lets the buyer's map plot the farmer's real
// device position instead of the time-estimated one (see getLiveTransitProgress and
// useLiveLocationSharing.js on the frontend).
export async function updateOrderLocation(req, res) {
  const existing = await fetchOrderOr404(req.params.id);
  if (req.profile.id !== existing.farmer_id) throw new ApiError('You do not have permission to update this order.', 403);
  if (existing.delivery_method === 'buyer_pickup') throw new ApiError('Pickup orders have no delivery location to share.', 400);
  if (existing.status !== 'confirmed' || existing.delivery_status !== 'out_for_delivery') {
    throw new ApiError('You can only share your location while the order is out for delivery.', 400);
  }

  const lat = Number(req.body.lat);
  const lng = Number(req.body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new ApiError('A valid lat and lng are required.', 400);

  const { data: order, error } = await supabaseAdmin
    .from('orders')
    .update({ current_lat: lat, current_lng: lng, location_updated_at: new Date().toISOString() })
    .eq('id', existing.id)
    .select()
    .single();
  if (error) throw new ApiError(error.message, 400);
  res.json(serializeOrder(order));
}
