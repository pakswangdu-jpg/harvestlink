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




  const { data: events } = await supabaseAdmin
    .from('order_delivery_events')
    .select('*')
    .eq('order_id', order.id)
    .order('occurred_at', { ascending: true });

  res.json({ ...serializeOrder(order), deliveryEvents: (events || []).map(serializeDeliveryEvent) });
}





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


  if (product.price_review?.status === 'pending') {
    throw new ApiError('This product is awaiting DTI price review and cannot be ordered yet.', 400);
  }

  const quantity = Number(values.quantity);
  if (!(quantity > 0)) throw new ApiError('Enter a positive request quantity.', 400);
  if (quantity > Number(product.quantity)) throw new ApiError(`Only ${product.quantity} ${product.unit} available.`, 400);
  if (!PAYMENT_METHODS.includes(values.paymentMethod)) throw new ApiError('Choose a valid payment method.', 400);

  const { data: farmer } = await supabaseAdmin
    .from('profiles')
    .select('name, avatar_url, farm_name, verification_status, gcash_account_name, gcash_qr_url')
    .eq('id', product.farmer_id)
    .single();
  if (values.paymentMethod === 'gcash' && (!farmer?.gcash_account_name || !farmer?.gcash_qr_url)) {
    throw new ApiError('This farmer has not finished setting up GCash payments. Please choose COD.', 400);
  }

  const originMunicipality = matchMunicipality(product.location);
  const deliveryMunicipality = values.deliveryMethod === 'buyer_pickup' ? originMunicipality : values.deliveryMunicipality;



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



    delivery_distance_km: deliveryDistanceKm,
    delivery_duration_minutes: deliveryDurationMinutes,
    delivery_fee_tier: deliveryFeeTier,
    total_amount: quantity * Number(product.price) + deliveryFee,
    message: values.message?.trim() || '',
    payment_method: values.paymentMethod,



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



  const isTransitStep = existing.delivery_method !== 'buyer_pickup' && nextStatus === sequence[sequence.length - 2];

  let vehiclePlateNumber = null;
  if (isTransitStep && existing.delivery_method === 'farmer_delivery') {
    vehiclePlateNumber = typeof req.body?.plateNumber === 'string'
      ? req.body.plateNumber.trim().toUpperCase()
      : '';
    if (!vehiclePlateNumber || vehiclePlateNumber.length > 15 || !/^[A-Z0-9 -]+$/.test(vehiclePlateNumber)) {
      throw new ApiError('Enter a valid vehicle plate number before starting delivery.', 400);
    }
  }



  if (isFinalStep && !isBuyer) throw new ApiError('Only the buyer can confirm the order was received.', 403);
  if (!isFinalStep && !isFarmer) throw new ApiError('Only the farmer can update delivery progress.', 403);

  const row = {
    delivery_status: nextStatus,
    status: isFinalStep ? 'completed' : existing.status,
    payment_status: isFinalStep && existing.payment_method === 'cod' ? 'paid' : existing.payment_status,
    ...(isTransitStep ? { transit_started_at: new Date().toISOString() } : null),
    ...(vehiclePlateNumber ? { vehicle_plate_number: vehiclePlateNumber } : null),


    ...(isFinalStep ? { current_lat: null, current_lng: null, location_updated_at: null } : null),
  };

  const { data: order, error } = await supabaseAdmin.from('orders').update(row).eq('id', existing.id).select().single();
  if (error) throw new ApiError(error.message, 400);




  await supabaseAdmin.from('order_delivery_events').insert({
    order_id: order.id,
    status: nextStatus,
    title: DELIVERY_STEP_LABELS[nextStatus] || nextStatus,
    description: nextStatus === 'preparing'
      ? `${order.farmer_name} is preparing your order.`
      : nextStatus === 'ready_for_pickup'
        ? `Your order from ${order.farmer_name} is ready for pickup.`
        : isTransitStep
          ? `${order.farmer_name} started delivering your order${vehiclePlateNumber ? ` with vehicle plate ${vehiclePlateNumber}` : ''}.`
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
