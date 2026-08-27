import { supabaseAdmin } from '../lib/supabaseClient.js';
import { serializeOrder, serializeDeliveryEvent } from '../lib/serialize.js';
import { createNotification } from '../lib/notify.js';
import { reduceProductQuantity, restoreProductQuantity } from './products.controller.js';
import { getDeliverySequence, getNextDeliveryStatus, isCancellable } from '../lib/deliverySequence.js';
import { matchMunicipality } from '../lib/geo.js';
import { calculateDeliveryFee } from '../lib/deliveryFee.js';
import { createLalamoveDeliveryForOrder } from './lalamove.controller.js';
import { PAYMENT_METHODS, DELIVERY_STEP_LABELS } from '../utils/constants.js';
import { ApiError } from '../lib/ApiError.js';

async function hydrateFarmerProfiles(orders) {
  const farmerIds = [...new Set(orders.map((order) => order.farmer_id).filter(Boolean))];
  const productIds = [...new Set(orders.map((order) => order.product_id).filter(Boolean))];

  const [{ data: farmers, error: farmersError }, { data: products, error: productsError }] = await Promise.all([
    farmerIds.length
      ? supabaseAdmin.from('profiles').select('id, name, avatar_url, farm_name, verification_status').in('id', farmerIds)
      : Promise.resolve({ data: [], error: null }),
    productIds.length
      ? supabaseAdmin.from('products').select('id, image_url').in('id', productIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (farmersError) throw new ApiError(farmersError.message, 400);
  if (productsError) throw new ApiError(productsError.message, 400);

  const farmerById = new Map((farmers || []).map((farmer) => [farmer.id, farmer]));
  const productById = new Map((products || []).map((product) => [product.id, product]));
  return orders.map((order) => {
    const farmer = farmerById.get(order.farmer_id);
    const product = productById.get(order.product_id);
    return {
      ...order,
      product_image_url: order.product_image_url || product?.image_url || null,
      ...(farmer ? {
        farmer_name: farmer.name || order.farmer_name,
        farmer_avatar_url: farmer.avatar_url || order.farmer_avatar_url || null,
        farmer_farm_name: farmer.farm_name || order.farmer_farm_name || null,
        farmer_verification_status: farmer.verification_status || order.farmer_verification_status || null,
      } : {}),
    };
  });
}

async function fetchOrderOr404(id) {
  const { data, error } = await supabaseAdmin.from('orders').select('*').eq('id', id).single();
  if (error || !data) throw new ApiError('Order was not found.', 404);
  // Keep older orders usable when their snapshot image is empty by resolving the current
  // product image, just like the orders list endpoint does.
  const [hydratedOrder] = await hydrateFarmerProfiles([data]);
  return hydratedOrder;
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
  res.json((await hydrateFarmerProfiles(data)).map(serializeOrder));
}

export async function getOrder(req, res) {
  const order = await fetchOrderOr404(req.params.id);
  assertParty(req, order);

  // Powers the status timeline (see CourierDeliveryTimeline.jsx and the equivalent for
  // farmer_delivery/buyer_pickup) — applies to every delivery method, not just courier, so it
  // lives on the single-order fetch rather than the courier-only GET /api/deliveries/:orderId.
  const { data: events } = await supabaseAdmin
    .from('order_delivery_events')
    .select('*')
    .eq('order_id', order.id)
    .order('occurred_at', { ascending: true });

  res.json({ ...serializeOrder(order), deliveryEvents: (events || []).map(serializeDeliveryEvent) });
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

  const { data: farmer } = await supabaseAdmin
    .from('profiles')
    .select('name, avatar_url, farm_name, verification_status')
    .eq('id', product.farmer_id)
    .single();

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
    product_image_url: product.image_url || null,
    unit: product.unit,
    unit_price: Number(product.price),
    // Snapshotted so profit stays accurate for this order even if the farmer later edits
    // or removes their recorded cost (see reportService.js's getTotalProfit).
    unit_cost_price: product.cost_price == null ? null : Number(product.cost_price),
    farmer_id: product.farmer_id,
    farmer_name: farmer?.name || 'Local farmer',
    farmer_avatar_url: farmer?.avatar_url || null,
    farmer_farm_name: farmer?.farm_name || null,
    farmer_verification_status: farmer?.verification_status || null,
    buyer_id: req.profile.id,
    buyer_name: req.profile.name,
    buyer_avatar_url: req.profile.avatar_url || null,
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

  await supabaseAdmin.from('order_delivery_events').insert({
    order_id: order.id,
    status: 'pending',
    title: 'Order placed',
    description: 'Your order has been placed.',
    source: 'system',
  });

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

  // Confirming a courier-method order is the moment a courier becomes the actual plan for
  // this delivery — the same trigger point used before the real Lalamove integration existed
  // (it just sent a notification). Now it also books the real Lalamove order. A failed
  // booking never undoes the order confirmation above — it leaves the farmer's existing
  // manual "Book with Lalamove" flow (LinkLalamoveDeliveryDialog.jsx) as the fallback.
  if (status === 'confirmed' && order.delivery_method === 'courier') {
    const bookingResult = await createLalamoveDeliveryForOrder(order);
    await createNotification({
      userId: order.farmer_id,
      type: 'order',
      title: bookingResult.booked ? 'Courier booked' : 'Courier booking needed',
      message: bookingResult.booked
        ? `A Lalamove driver is being assigned for delivery to ${order.buyer_name}.`
        : `This order needs a courier for delivery to ${order.buyer_name} — automatic booking didn't go through, book it manually with Lalamove.`,
      link: `/orders/${order.id}`,
    });
  }

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

  // One delivery_events row per real transition — same DELIVERY_SEQUENCES step this endpoint
  // already advances, just also recorded as buyer-facing history (see
  // CourierDeliveryTimeline.jsx and the order-details timeline for farmer_delivery/buyer_pickup).
  await supabaseAdmin.from('order_delivery_events').insert({
    order_id: order.id,
    status: nextStatus,
    title: DELIVERY_STEP_LABELS[nextStatus] || nextStatus,
    description: nextStatus === 'preparing'
      ? `${order.farmer_name} is preparing your order.`
      : nextStatus === 'ready_for_pickup'
        ? `Your order from ${order.farmer_name} is ready for pickup.`
        : isTransitStep
          ? `${order.farmer_name} started delivering your order.`
          : isFinalStep
            ? (order.delivery_method === 'buyer_pickup'
              ? `You confirmed picking up your order from ${order.farmer_name}.`
              : `Your order from ${order.farmer_name} has been delivered.`)
            : DELIVERY_STEP_LABELS[nextStatus] || nextStatus,
    source: isFinalStep ? 'buyer' : 'farmer',
  });

  if (nextStatus === 'preparing') {
    await createNotification({
      userId: order.buyer_id,
      type: 'order',
      title: 'Order preparing',
      message: `${order.farmer_name} is preparing your order.`,
      link: `/orders/${order.id}`,
    });
  }
  if (nextStatus === 'ready_for_pickup') {
    await createNotification({
      userId: order.buyer_id,
      type: 'order',
      title: 'Ready for pickup',
      message: `Your order from ${order.farmer_name} is ready for pickup.`,
      link: `/orders/${order.id}`,
    });
  }
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
    // The farmer only learns their delivery actually completed once the BUYER confirms
    // receipt (see the isFinalStep comment above) — this is that closing-the-loop notice.
    await createNotification({
      userId: order.farmer_id,
      type: 'order',
      title: isPickup ? 'Order picked up' : 'Order delivered',
      message: isPickup
        ? `${order.buyer_name} picked up their order.`
        : `${order.buyer_name}'s order was delivered.`,
      link: `/orders/${order.id}`,
    });
    await createNotification({
      userId: order.buyer_id,
      type: 'order',
      title: 'Review reminder',
      message: `How was your order from ${order.farmer_name}? Leave a review.`,
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
