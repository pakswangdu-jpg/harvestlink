import { supabaseAdmin } from '../lib/supabaseClient.js';
import { serializeOrder, serializeDeliveryEvent } from '../lib/serialize.js';
import { createNotification } from '../lib/notify.js';
import { linkProductConversationToOrder } from '../lib/messageTraceability.js';
import { createHash } from 'node:crypto';
import { getDeliverySequence, getNextDeliveryStatus, isCancellable } from '../lib/deliverySequence.js';
import { PAYMENT_METHODS, DELIVERY_STEP_LABELS } from '../utils/constants.js';
import { ApiError } from '../lib/ApiError.js';
import { buildCheckoutQuote } from '../lib/checkoutQuote.js';
import { queryAdminOrders } from '../lib/adminOrderQuery.js';
import { loadOrderReceipt } from '../lib/orderReceipt.js';
import { normalizeManualLalamoveTrackingUrl, validateManualLalamoveFee, MAX_MANUAL_LALAMOVE_FEE } from '../../shared/lalamove.js';
import {
  EXPIRED_PRODUCT_ERROR_CODE,
  EXPIRED_PRODUCT_ERROR_MESSAGE,
  EXPIRED_PRODUCT_ERROR_TITLE,
  isProductExpired,
} from '../../shared/expiration.js';
import {
  WHOLESALE_DELIVERY_METHOD,
  WHOLESALE_DELIVERY_METHOD_LABELS,
  getWholesaleNextDeliveryStatus,
  isRetailLalamoveOrder,
  isWholesaleOrder,
  usesSharedArrangedDelivery,
  validateWholesaleArrangementInput,
} from '../../shared/wholesaleDelivery.js';

async function transitionOrder(actor, orderId, action, reason) {
  const { data, error } = await supabaseAdmin.rpc('transition_marketplace_order', {
    p_actor: actor, p_order: orderId, p_action: action, p_reason: reason || null,
  });
  if (error) {
    if (error.code === 'PGRST202' || error.code === '42883') {
      throw new ApiError('Order safeguards are not configured. Please contact support.', 503);
    }
    throw new ApiError(error.message, error.code === '42501' ? 403 : error.code === 'P0002' ? 404 : 409);
  }
  return data;
}

export async function getCheckoutQuote(req, res) {
  const { data: product, error } = await supabaseAdmin.from('products').select('*').eq('id', req.body.productId).single();
  if (error || !product) throw new ApiError('Product was not found.', 404);
  if (req.profile.role === 'admin' || product.farmer_id === req.profile.id) throw new ApiError('You cannot order this product.', 403);
  const quote = await buildCheckoutQuote(product, {
    ...req.body,
    deliveryMunicipality: req.profile.municipality || req.body.deliveryMunicipality,
  });
  if (product.selling_type === 'wholesale') {
    res.json({ ...quote, total: null, requiresFarmerArrangement: true });
    return;
  }
  res.json(req.body.deliveryMethod === 'courier' ? { ...quote, total: null, requiresDeliveryQuote: true } : quote);
}

export async function manageLalamoveDeliveryQuote(req, res) {
  const { action, fee, quotedAt } = req.body || {};
  if (!['propose', 'accept', 'decline'].includes(action)) throw new ApiError('Choose a valid quote action.', 400);
  if (action === 'propose' && !validateManualLalamoveFee(fee)) {
    throw new ApiError(`Enter a delivery fee from PHP 0 to PHP ${MAX_MANUAL_LALAMOVE_FEE.toLocaleString('en-PH')} with up to two decimals.`, 400);
  }
  if (action !== 'propose' && (typeof quotedAt !== 'string' || Number.isNaN(Date.parse(quotedAt)))) {
    throw new ApiError('Refresh the delivery quote before responding.', 400);
  }
  const { data, error } = await supabaseAdmin.rpc('manage_lalamove_delivery_quote', {
    p_actor: req.profile.id, p_order: req.params.id, p_action: action,
    p_fee: action === 'propose' ? fee : null, p_quoted_at: action === 'propose' ? null : quotedAt,
  });
  if (error) {
    if (['42883', 'PGRST202'].includes(error.code)) throw new ApiError('Lalamove delivery pricing requires the latest database migration.', 503);
    throw new ApiError(error.message, error.code === '42501' ? 403 : error.code === 'P0002' ? 404 : 409);
  }
  const { order, changed } = data;
  if (changed) {
    const title = { propose: 'Lalamove total ready for review', accept: 'Lalamove total accepted', decline: 'Lalamove quote declined' }[action];
    const message = {
      propose: 'The farmer entered a delivery price. Open your order to review the total.',
      accept: 'The recipient accepted the order total. Check the payment status before confirming the order.',
      decline: 'The recipient declined the delivery quote. The order was cancelled and its reserved stock released.',
    }[action];
    await createNotification({ userId: action === 'propose' ? order.buyer_id : order.farmer_id, type: 'order', title, message, link: `/orders/${order.id}` })
      .catch((failure) => console.warn('Lalamove quote notification failed:', failure.message));
  }
  res.json(serializeOrderForViewer(order, req.profile));
}

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

function serializeOrderForViewer(order, profile) {
  const serialized = serializeOrder(order);
  if (order.delivery_method === 'courier' && (
    (profile.role === 'farmer' && profile.id === order.farmer_id)
    || (['buyer', 'stakeholder'].includes(profile.role) && profile.id === order.buyer_id)
  )) {
    serialized.manualLalamoveTrackingUrl = normalizeManualLalamoveTrackingUrl(order.manual_lalamove_tracking_url);
  }
  return serialized;
}



export async function listOrders(req, res) {
  if (req.query.page !== undefined) {
    const { rows, ...page } = await queryAdminOrders(req.profile, req.query);
    return res.json({ ...page, orders: (await hydrateFarmerProfiles(rows)).map(serializeOrder) });
  }
  let query = supabaseAdmin.from('orders').select('*').order('created_at', { ascending: false });

  if (req.profile.role === 'admin') {
    if (req.query.buyerId) query = query.eq('buyer_id', req.query.buyerId);
    if (req.query.farmerId) query = query.eq('farmer_id', req.query.farmerId);
  } else {
    query = query.or(`buyer_id.eq.${req.profile.id},farmer_id.eq.${req.profile.id}`);
  }

  const { data, error } = await query;
  if (error) throw new ApiError(error.message, 400);
  const orders = (await hydrateFarmerProfiles(data)).map((order) => serializeOrderForViewer(order, req.profile));
  if (orders.some((order) => order.manualLalamoveTrackingUrl)) res.setHeader('Cache-Control', 'private, no-store');
  res.json(orders);
}

export async function getOrder(req, res) {
  const order = await fetchOrderOr404(req.params.id);
  assertParty(req, order);




  const { data: events, error: eventsError } = await supabaseAdmin
    .from('order_delivery_events')
    .select('*')
    .eq('order_id', order.id)
    .order('occurred_at', { ascending: true });

  if (eventsError) throw new ApiError('Unable to load order history. Try again.', 500);
  const serialized = serializeOrderForViewer(order, req.profile);
  if (serialized.manualLalamoveTrackingUrl) res.setHeader('Cache-Control', 'private, no-store');
  res.json({ ...serialized, deliveryEvents: (events || []).map(serializeDeliveryEvent) });
}

export async function getOrderTrackingProfiles(req, res) {
  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .select('id, buyer_id, farmer_id')
    .eq('id', req.params.id)
    .single();
  if (orderError || !order) throw new ApiError('Order was not found.', 404);
  assertParty(req, order);

  const profileFields = 'id, role, name, farm_name, address, municipality, latitude, longitude';
  const [{ data: farmer, error: farmerError }, { data: buyer, error: buyerError }] = await Promise.all([
    supabaseAdmin.from('profiles').select(profileFields).eq('id', order.farmer_id).single(),
    supabaseAdmin.from('profiles').select(profileFields).eq('id', order.buyer_id).single(),
  ]);
  if (farmerError || !farmer || buyerError || !buyer) {
    throw new ApiError('Unable to load the saved delivery locations.', 500);
  }

  res.setHeader('Cache-Control', 'no-store');
  res.json({ farmer, buyer });
}

export async function getOrderReceipt(req, res) {
  const { data: order, error } = await supabaseAdmin.from('orders').select('*').eq('id', req.params.id).single();
  if (error || !order) throw new ApiError('Order was not found.', 404);
  const { isBuyer } = assertParty(req, order);
  res.setHeader('Cache-Control', 'no-store');
  res.json(await loadOrderReceipt(order, { includeBuyerEmail: isBuyer }));
}





export async function createOrder(req, res) {
  if (req.profile.role === 'admin') throw new ApiError('Admin accounts cannot place orders.', 403);

  const values = {
    ...req.body,
    deliveryMunicipality: req.profile.municipality || req.body.deliveryMunicipality,
  };
  const checkoutKey = values.checkoutKey;
  if (checkoutKey && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(checkoutKey)) {
    throw new ApiError('Invalid checkout request key.', 400);
  }
  const fingerprint = createHash('sha256').update(JSON.stringify([
    values.productId, Number(values.quantity), values.paymentMethod, values.deliveryMethod,
    values.deliveryMethod === 'buyer_pickup' ? null : values.deliveryMunicipality, values.message?.trim() || '',
  ])).digest('hex');
  const findPrevious = async () => {
    const { data, error } = await supabaseAdmin.from('orders').select('*').eq('buyer_id', req.profile.id).eq('checkout_key', checkoutKey).maybeSingle();
    if (error) throw new ApiError(error.message, 400);
    if (data && data.checkout_fingerprint !== fingerprint) throw new ApiError('This checkout request was already used for another order.', 409);
    return data;
  };
  if (checkoutKey) {
    const previous = await findPrevious();
    if (previous) {
      await linkProductConversationToOrder(previous);
      return res.json(serializeOrder(previous));
    }
  }
  const { data: product, error: productError } = await supabaseAdmin
    .from('products')
    .select('*')
    .eq('id', values.productId)
    .single();
  if (productError || !product) throw new ApiError('Product was not found.', 404);
  if (product.farmer_id === req.profile.id) throw new ApiError('You cannot order your own product.', 400);
  if (isProductExpired(product.expiration_date)) {
    throw new ApiError(
      EXPIRED_PRODUCT_ERROR_MESSAGE,
      400,
      EXPIRED_PRODUCT_ERROR_CODE,
      EXPIRED_PRODUCT_ERROR_TITLE,
    );
  }
  if (Number(product.quantity) <= 0) {
    throw new ApiError(
      'Sorry, this product is no longer available. Another buyer has already reserved the remaining stock.',
      409,
      'PRODUCT_OUT_OF_STOCK',
    );
  }
  if (product.status !== 'active') throw new ApiError('This product is no longer available.', 400);


  if (['pending', 'needs_adjustment'].includes(product.price_review?.status)) {
    throw new ApiError('This product is awaiting DTI price review and cannot be ordered yet.', 400);
  }

  const quantity = Number(values.quantity);
  if (!Number.isFinite(quantity) || !(quantity > 0)) throw new ApiError('Enter a positive request quantity.', 400);
  if (quantity > Number(product.quantity)) {
    throw new ApiError(
      `Only ${product.quantity} ${product.unit} remaining. Please update your order quantity.`,
      409,
      'INSUFFICIENT_STOCK',
    );
  }
  if (product.selling_type === 'wholesale' && product.moq && quantity < Number(product.moq)) {
    throw new ApiError(`Minimum order quantity is ${product.moq} ${product.unit}.`, 400);
  }
  if (!PAYMENT_METHODS.includes(values.paymentMethod)) throw new ApiError('Choose a valid payment method.', 400);

  const { data: farmer } = await supabaseAdmin
    .from('profiles')
    .select('name, avatar_url, farm_name, verification_status, account_status, gcash_account_name, gcash_qr_url')
    .eq('id', product.farmer_id)
    .single();
  if (farmer?.account_status === 'suspended') throw new ApiError('This farmer is not currently accepting orders.', 400);
  if (values.paymentMethod === 'gcash' && (!farmer?.gcash_account_name || !farmer?.gcash_qr_url)) {
    throw new ApiError('This farmer has not finished setting up GCash payments. Please choose COD.', 400);
  }

  const isWholesaleListing = product.selling_type === 'wholesale';
  const resolvedDeliveryMethod = isWholesaleListing ? WHOLESALE_DELIVERY_METHOD : values.deliveryMethod;
  const isRetailLalamove = !isWholesaleListing && resolvedDeliveryMethod === 'courier';
  const usesArrangedFlow = isWholesaleListing || isRetailLalamove;
  const rawDeliveryAddress = values.deliveryAddress !== undefined
    ? String(values.deliveryAddress || '').trim()
    : String(req.profile.address || values.deliveryMunicipality || '').trim();
  if (usesArrangedFlow && values.deliveryAddress !== undefined && !rawDeliveryAddress) {
    throw new ApiError(
      isWholesaleListing
        ? 'Enter your delivery address for this wholesale order.'
        : 'Enter your delivery address for Lalamove delivery.',
      400,
    );
  }
  const deliveryAddress = usesArrangedFlow ? (rawDeliveryAddress || null) : null;

  const quote = await buildCheckoutQuote(product, {
    ...values,
    deliveryMethod: resolvedDeliveryMethod,
  });
  const { originMunicipality, deliveryMunicipality, unitPrice } = quote;
  if (values.expectedTotal !== undefined && (!Number.isFinite(Number(values.expectedTotal)) || Math.abs(Number(values.expectedTotal) - quote.total) > 0.001)) {
    throw new ApiError('The price or delivery fee changed. Refresh the order summary and review the updated total before placing your order.', 409);
  }



  const {
    fee: deliveryFee,
    distanceKm: deliveryDistanceKm,
    durationMinutes: deliveryDurationMinutes,
    tierLabel: deliveryFeeTier,
  } = quote.estimate;
  const now = new Date().toISOString();

  const row = {
    product_id: product.id,
    product_name: product.name,
    product_image_url: product.image_url || null,
    unit: product.unit,
    unit_price: unitPrice,


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
    delivery_fee: usesArrangedFlow ? 0 : deliveryFee,



    delivery_distance_km: usesArrangedFlow ? null : deliveryDistanceKm,
    delivery_duration_minutes: usesArrangedFlow ? null : deliveryDurationMinutes,
    delivery_fee_tier: isWholesaleListing
      ? 'Farmer-arranged'
      : isRetailLalamove
        ? 'Lalamove (Pending farmer confirmation)'
        : deliveryFeeTier,
    total_amount: usesArrangedFlow ? quote.subtotal : quote.total,
    ...(checkoutKey ? { checkout_key: checkoutKey, checkout_fingerprint: fingerprint } : {}),
    product_id_snapshot: product.id,
    message: values.message?.trim() || '',
    payment_method: values.paymentMethod,



    payment_status: 'pending',
    delivery_method: resolvedDeliveryMethod,
    delivery_status: 'pending',
    selling_type: isWholesaleListing ? 'wholesale' : 'retail',
    delivery_arrangement_status: usesArrangedFlow ? 'pending_farmer' : null,
    delivery_address: deliveryAddress,
    origin_municipality: originMunicipality,
    delivery_municipality: deliveryMunicipality,
    status: 'pending',
    created_at: now,
    updated_at: now,
  };

  let order;
  let error;
  if (typeof supabaseAdmin.rpc === 'function') {
    ({ data: order, error } = await supabaseAdmin.rpc('create_marketplace_order', {
      p_actor: req.profile.id,
      p_order: row,
    }));
  } else {
    throw new ApiError('Inventory safeguards are not configured. Please contact support.', 503);
  }
  if (error) {
    if (checkoutKey && error.code === '23505') {
      const previous = await findPrevious();
      if (previous) {
        await linkProductConversationToOrder(previous);
        return res.json(serializeOrder(previous));
      }
    }
    if (['PGRST202', '42883'].includes(error.code)) {
      throw new ApiError('Inventory safeguards are not configured. Please contact support.', 503);
    }
    if (error.code === '23514' && error.message === 'Requested quantity is no longer available.') {
      const { data: latestProduct, error: stockReadError } = await supabaseAdmin
        .from('products')
        .select('quantity, unit')
        .eq('id', product.id)
        .maybeSingle();
      if (stockReadError) {
        throw new ApiError('We could not verify the latest stock. Please refresh the product and try again.', 503);
      }
      if (!latestProduct || Number(latestProduct.quantity) <= 0) {
        throw new ApiError(
          'Sorry, this product is no longer available. Another buyer has already reserved the remaining stock.',
          409,
          'PRODUCT_OUT_OF_STOCK',
        );
      }
      if (Number(latestProduct.quantity) < Number(row.quantity)) {
        throw new ApiError(
          `Only ${latestProduct.quantity} ${latestProduct.unit} remaining. Please update your order quantity.`,
          409,
          'INSUFFICIENT_STOCK',
        );
      }
    }
    throw new ApiError(error.message, ['23514', '23505'].includes(error.code) ? 409 : error.code === '42501' ? 403 : 400);
  }

  await createNotification({
    userId: order.farmer_id,
    type: 'order',
    title: isWholesaleListing
      ? 'New wholesale order'
      : isRetailLalamove
        ? 'New Lalamove order'
        : 'New order received',
    message: isWholesaleListing
      ? `${order.buyer_name} placed a wholesale order for ${order.quantity} ${order.unit} of ${order.product_name}. Please review and arrange delivery.`
      : isRetailLalamove
        ? `${order.buyer_name} placed a Lalamove order for ${order.quantity} ${order.unit} of ${order.product_name}. Please review and arrange delivery.`
        : `${order.buyer_name} ordered ${order.quantity} ${order.unit} of ${order.product_name}.`,
    link: `/orders/${order.id}`,
  });

  await linkProductConversationToOrder(order);

  res.status(201).json(serializeOrder(order));
}


export async function updateOrderStatus(req, res) {
  const existing = await fetchOrderOr404(req.params.id);
  if (req.profile.id !== existing.farmer_id) throw new ApiError('You do not have permission to modify this order.', 403);
  if (existing.status !== 'pending') throw new ApiError('This order has already been reviewed.', 400);

  const { status } = req.body;
  if (!['confirmed', 'rejected'].includes(status)) throw new ApiError('Invalid order status.', 400);
  if (status === 'confirmed' && usesSharedArrangedDelivery(existing)) {
    if (existing.delivery_arrangement_status !== 'confirmed') {
      throw new ApiError('The buyer must confirm the delivery arrangement and final total before you confirm this order.', 409);
    }
  }
  if (status === 'confirmed' && existing.lalamove_quote_status) {
    if (existing.lalamove_quote_status !== 'accepted') throw new ApiError('The recipient must accept the Lalamove total first.', 409);
    if (existing.payment_method === 'gcash' && existing.payment_status !== 'paid') throw new ApiError('Verify GCash payment before confirming this order.', 409);
  }

  const order = await transitionOrder(req.profile.id, existing.id, status, req.body.reason);

  if (status === 'confirmed' && usesSharedArrangedDelivery(order)) {
    await supabaseAdmin.from('order_delivery_events').insert({
      order_id: order.id,
      status: 'confirmed',
      title: 'Order Confirmed',
      description: 'The farmer has confirmed your order and delivery arrangements.',
      source: 'farmer',
    });
  }

  await createNotification({
    userId: order.buyer_id,
    type: 'order',
    title: status === 'confirmed' ? 'Order confirmed' : 'Order rejected',
    message: status === 'confirmed'
      ? (isWholesaleOrder(order)
        ? `${order.farmer_name} confirmed your wholesale order and delivery arrangements for ${order.product_name}.`
        : isRetailLalamoveOrder(order)
          ? `${order.farmer_name} confirmed your Lalamove order and delivery arrangements for ${order.product_name}.`
          : `${order.farmer_name} confirmed your order for ${order.product_name}.`)
      : `${order.farmer_name} rejected your order for ${order.product_name}.${order.rejection_reason ? ` Reason: ${order.rejection_reason}` : ''}`,
    link: `/orders/${order.id}`,
  });

  if (status === 'confirmed' && order.delivery_method === 'courier' && !usesSharedArrangedDelivery(order)) {
    await createNotification({
      userId: order.farmer_id,
      type: 'order',
      title: 'Courier booking needed',
      message: `Prepare and pack this order, then book Lalamove manually for delivery to ${order.buyer_name}.`,
      link: `/orders/${order.id}`,
    });
  }

  res.json(serializeOrder(order));
}

export async function cancelOrder(req, res) {
  const existing = await fetchOrderOr404(req.params.id);
  if (req.profile.id !== existing.buyer_id) throw new ApiError('You do not have permission to cancel this order.', 403);
  if (!isCancellable(existing)) throw new ApiError('This order can no longer be cancelled.', 400);

  const order = await transitionOrder(req.profile.id, existing.id, 'cancelled', req.body?.reason);
  await createNotification({ userId: order.farmer_id, type: 'order', title: 'Order cancelled', message: `${order.buyer_name} cancelled their order for ${order.product_name}.`, link: `/orders/${order.id}` });
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
  if (isTransitStep && existing.delivery_method === 'courier') {
    throw new ApiError('Save the Lalamove booking and confirm physical handover from courier details.', 400);
  }

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
    ...(isFinalStep && existing.payment_method === 'cod' && existing.payment_status !== 'paid'
      ? { paid_at: new Date().toISOString() }
      : null),
    ...(isTransitStep ? { transit_started_at: new Date().toISOString() } : null),
    ...(vehiclePlateNumber ? { vehicle_plate_number: vehiclePlateNumber } : null),


    ...(isFinalStep ? { current_lat: null, current_lng: null, location_updated_at: null } : null),
  };

  let order;
  if (isFinalStep) {
    const { data, error } = await supabaseAdmin.rpc('complete_marketplace_order', {
      p_actor: req.profile.id,
      p_order: existing.id,
      p_delivery_status: nextStatus,
      p_payment_status: existing.payment_method === 'cod' ? 'paid' : existing.payment_status,
    });
    if (error) {
      if (['PGRST202', '42883'].includes(error.code)) {
        throw new ApiError('Inventory safeguards are not configured. Please contact support.', 503);
      }
      throw new ApiError(error.message, error.code === '42501' ? 403 : error.code === 'P0002' ? 404 : 409);
    }
    order = { ...existing, ...row, ...data };
  } else {
    const { data, error } = await supabaseAdmin.from('orders').update(row).eq('id', existing.id)
      .eq('status', existing.status).eq('delivery_status', existing.delivery_status).select().maybeSingle();
    if (error) throw new ApiError(error.message, 400);
    if (!data) throw new ApiError('Order progress changed. Refresh before trying again.', 409);
    order = data;
  }

  if (!isFinalStep) {
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
            : DELIVERY_STEP_LABELS[nextStatus] || nextStatus,
      source: 'farmer',
    });
  }

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
  if (nextStatus === 'packed') {
    await createNotification({ userId: order.buyer_id, type: 'order', title: 'Order packed', message: `${order.farmer_name} packed your order for ${order.product_name}.`, link: `/orders/${order.id}` });
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





export async function arrangeWholesaleDelivery(req, res) {
  const existing = await fetchOrderOr404(req.params.id);
  if (req.profile.role !== 'farmer' || req.profile.id !== existing.farmer_id) {
    throw new ApiError('Only the owning farmer can arrange delivery for this order.', 403);
  }
  if (!usesSharedArrangedDelivery(existing)) {
    throw new ApiError('Farmer-arranged delivery is only available for wholesale orders and retail Lalamove orders.', 400);
  }
  if (existing.status !== 'pending') {
    throw new ApiError('Delivery arrangements can only be updated before the order is confirmed.', 409);
  }

  const isRetailLalamove = isRetailLalamoveOrder(existing);
  const input = {
    deliveryMethod: isRetailLalamove ? 'courier' : req.body?.deliveryMethod,
    deliveryFee: req.body?.deliveryFee,
    estimatedPickupTime: req.body?.estimatedPickupTime,
    estimatedDeliveryAt: req.body?.estimatedDeliveryAt,
    bookingReference: req.body?.bookingReference,
    vehiclePlateNumber: req.body?.vehiclePlateNumber,
    deliveryInstructions: req.body?.deliveryInstructions,
  };
  if (isRetailLalamove && req.body?.deliveryMethod && req.body.deliveryMethod !== 'courier') {
    throw new ApiError('Retail Lalamove orders must use Lalamove delivery.', 400);
  }
  const validationErrors = validateWholesaleArrangementInput(input);
  const firstError = Object.values(validationErrors)[0];
  if (firstError) throw new ApiError(firstError, 400);

  const fee = Number(input.deliveryFee);
  const estimatedDeliveryIso = input.estimatedDeliveryAt
    ? new Date(input.estimatedDeliveryAt).toISOString()
    : null;
  const normalizedPlate = input.deliveryMethod !== 'buyer_pickup' && String(input.vehiclePlateNumber || '').trim()
    ? String(input.vehiclePlateNumber).trim().toUpperCase()
    : null;
  const subtotal = Math.round((Number(existing.unit_price) * Number(existing.quantity) + Number.EPSILON) * 100) / 100;
  const revisedTotal = Math.round((subtotal + fee + Number.EPSILON) * 100) / 100;

  let order;
  if (typeof supabaseAdmin.rpc === 'function') {
    const { data, error } = await supabaseAdmin.rpc('arrange_wholesale_delivery', {
      p_actor: req.profile.id,
      p_order: existing.id,
      p_delivery_method: input.deliveryMethod,
      p_delivery_fee: fee,
      p_estimated_pickup_time: input.estimatedPickupTime?.trim() || null,
      p_estimated_delivery_at: estimatedDeliveryIso,
      p_booking_reference: input.bookingReference?.trim() || null,
      p_delivery_instructions: input.deliveryInstructions?.trim() || null,
    });
    if (error) {
      if (['PGRST202', '42883'].includes(error.code)) {
        throw new ApiError('Wholesale delivery safeguards are not configured. Please run the latest database migration.', 503);
      }
      throw new ApiError(error.message, error.code === '42501' ? 403 : error.code === 'P0002' ? 404 : 409);
    }
    order = data;
    if (order && (normalizedPlate !== (order.vehicle_plate_number || null))) {
      const { data: plateUpdated, error: plateError } = await supabaseAdmin
        .from('orders')
        .update({ vehicle_plate_number: normalizedPlate })
        .eq('id', order.id)
        .select()
        .single();
      if (!plateError && plateUpdated) order = plateUpdated;
    }
  } else {
    const arrangedAt = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from('orders')
      .update({
        delivery_method: input.deliveryMethod,
        delivery_fee: fee,
        delivery_fee_tier: input.deliveryMethod === 'courier'
          ? 'Lalamove (Farmer-arranged)'
          : input.deliveryMethod === 'buyer_pickup'
            ? 'Buyer Pickup'
            : 'Farmer Delivery',
        total_amount: revisedTotal,
        estimated_pickup_time: input.estimatedPickupTime?.trim() || null,
        estimated_delivery_at: estimatedDeliveryIso,
        courier_booking_reference: input.bookingReference?.trim() || null,
        vehicle_plate_number: normalizedPlate,
        delivery_instructions: input.deliveryInstructions?.trim() || null,
        delivery_arrangement_status: 'pending_buyer_confirmation',
        delivery_arranged_at: arrangedAt,
        buyer_confirmed_total_at: null,
        buyer_confirmed_total: null,
        updated_at: arrangedAt,
      })
      .eq('id', existing.id)
      .select()
      .single();
    if (error) throw new ApiError(error.message, 400);
    order = data;
  }

  const methodLabel = WHOLESALE_DELIVERY_METHOD_LABELS[order.delivery_method] || order.delivery_method;
  const isRevised = existing.delivery_arrangement_status === 'pending_buyer_confirmation'
    || existing.delivery_arrangement_status === 'confirmed';
  const formatPhp = (value) => Number(value || 0).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const totalFormatted = formatPhp(order.total_amount);
  const subtotalFormatted = formatPhp(subtotal);
  const feeFormatted = formatPhp(order.delivery_fee);
  const paymentReminder = order.payment_method === 'gcash'
    ? `Please prepare the exact amount of ₱${totalFormatted} (Subtotal: ₱${subtotalFormatted} + Delivery fee: ₱${feeFormatted}) for GCash payment. Review and confirm the final total.`
    : `Please prepare the exact amount of ₱${totalFormatted} (Subtotal: ₱${subtotalFormatted} + Delivery fee: ₱${feeFormatted}) for Cash on Delivery. Review and confirm the final total.`;

  await createNotification({
    userId: order.buyer_id,
    type: 'order',
    title: isRevised ? 'Updated delivery arrangement' : 'Delivery arrangement submitted',
    message: `${order.farmer_name} arranged ${methodLabel} for your ${order.product_name} order. ${paymentReminder}`,
    link: `/orders/${order.id}`,
  });

  res.json(serializeOrder(order));
}

export async function confirmWholesaleDelivery(req, res) {
  const existing = await fetchOrderOr404(req.params.id);
  if (req.profile.id !== existing.buyer_id) {
    throw new ApiError('Only the buyer can confirm the delivery total.', 403);
  }
  if (!usesSharedArrangedDelivery(existing)) {
    throw new ApiError('This order does not use farmer-arranged delivery confirmation.', 400);
  }
  if (existing.status !== 'pending' || existing.delivery_arrangement_status !== 'pending_buyer_confirmation') {
    throw new ApiError('This delivery arrangement is not awaiting buyer confirmation.', 409);
  }

  const arrangedAt = req.body?.arrangedAt;
  if (!arrangedAt || arrangedAt !== existing.delivery_arranged_at) {
    throw new ApiError('The delivery fee or arrangement was updated. Please review and confirm the revised total.', 409);
  }

  let order;
  if (typeof supabaseAdmin.rpc === 'function') {
    const { data, error } = await supabaseAdmin.rpc('confirm_wholesale_delivery', {
      p_actor: req.profile.id,
      p_order: existing.id,
      p_arranged_at: arrangedAt,
    });
    if (error) {
      if (['PGRST202', '42883'].includes(error.code)) {
        throw new ApiError('Wholesale delivery safeguards are not configured. Please run the latest database migration.', 503);
      }
      throw new ApiError(error.message, error.code === '42501' ? 403 : error.code === 'P0002' ? 404 : 409);
    }
    order = data;
  } else {
    const now = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from('orders')
      .update({
        delivery_arrangement_status: 'confirmed',
        buyer_confirmed_total_at: now,
        buyer_confirmed_total: existing.total_amount,
        updated_at: now,
      })
      .eq('id', existing.id)
      .select()
      .single();
    if (error) throw new ApiError(error.message, 400);
    order = data;
  }

  await createNotification({
    userId: order.farmer_id,
    type: 'order',
    title: 'Final order amount confirmed',
    message: `${order.buyer_name} confirmed the delivery arrangement and final total (PHP ${Number(order.total_amount).toFixed(2)}) for ${order.product_name}.`,
    link: `/orders/${order.id}`,
  });

  res.json(serializeOrder(order));
}

const WHOLESALE_EVENT_COPY = {
  waiting_for_courier: {
    title: 'Waiting for Courier',
    description: 'The delivery has been booked and is awaiting courier pickup.',
    notifyTitle: 'Courier booking confirmed',
    notifyMessage: (order) => `Your Lalamove delivery for ${order.product_name} has been booked and is awaiting courier pickup.`,
  },
  preparing: {
    title: 'Preparing Order',
    description: 'The farmer is preparing your wholesale order for delivery.',
    notifyTitle: 'Order preparing',
    notifyMessage: (order) => `${order.farmer_name} is preparing your wholesale order for ${order.product_name}.`,
  },
  ready_for_pickup: {
    title: 'Ready for Pickup',
    description: 'Your wholesale order is ready for collection at the agreed pickup location.',
    notifyTitle: 'Ready for pickup',
    notifyMessage: (order) => `Your wholesale order for ${order.product_name} is ready for pickup.`,
  },
  in_transit: {
    title: 'In Transit',
    description: 'Your order has been collected and is on its way to your delivery address.',
    notifyTitle: 'Order in transit',
    notifyMessage: (order) => `Your ${isWholesaleOrder(order) ? 'wholesale' : 'Lalamove'} order for ${order.product_name} has been collected and is now in transit.`,
  },
  delivered: {
    title: 'Order Delivered',
    description: 'Your order has been delivered. Please confirm receipt of your products.',
    notifyTitle: 'Order delivered',
    notifyMessage: (order) => `Your ${isWholesaleOrder(order) ? 'wholesale' : 'Lalamove'} order for ${order.product_name} has been delivered. Please confirm receipt.`,
  },
  completed: {
    title: 'Order Completed',
    description: 'You have successfully confirmed receipt of your order.',
    notifyTitle: 'Order completed',
    notifyMessage: (order) => `${order.buyer_name} confirmed receipt of the ${isWholesaleOrder(order) ? 'wholesale' : 'Lalamove'} order for ${order.product_name}.`,
  },
};

export async function advanceWholesaleDelivery(req, res) {
  const existing = await fetchOrderOr404(req.params.id);
  const isBuyer = req.profile.id === existing.buyer_id;
  const isFarmer = req.profile.id === existing.farmer_id;
  if (!isBuyer && !isFarmer) throw new ApiError('You do not have permission to modify this order.', 403);
  if (!usesSharedArrangedDelivery(existing)) {
    throw new ApiError('This delivery status workflow applies only to wholesale and Lalamove orders.', 400);
  }
  if (existing.status !== 'confirmed') {
    throw new ApiError('Only confirmed orders can be updated.', 400);
  }

  const nextStatus = getWholesaleNextDeliveryStatus(existing);
  if (!nextStatus) throw new ApiError('This order has already reached its final status.', 400);

  if (req.body?.targetStatus && req.body.targetStatus !== nextStatus) {
    throw new ApiError('Invalid delivery status transition. Update statuses in sequence.', 409);
  }

  const isCompletionStep = nextStatus === 'completed';
  if (isCompletionStep && !isBuyer) {
    throw new ApiError('Only the buyer can confirm receipt of the order.', 403);
  }
  if (!isCompletionStep && !isFarmer) {
    throw new ApiError('Only the farmer can update delivery progress.', 403);
  }

  const requiresGcashBeforeDispatch = existing.payment_method === 'gcash'
    && existing.payment_status !== 'paid'
    && ['waiting_for_courier', 'preparing', 'ready_for_pickup', 'in_transit'].includes(nextStatus);
  if (requiresGcashBeforeDispatch) {
    throw new ApiError('GCash payment must be verified before dispatching this order.', 409);
  }

  const now = new Date().toISOString();
  let order;

  if (isCompletionStep) {
    const finalDeliveryStatus = existing.delivery_method === 'buyer_pickup' ? 'picked_up' : 'delivered';
    if (typeof supabaseAdmin.rpc === 'function') {
      const { data, error } = await supabaseAdmin.rpc('complete_marketplace_order', {
        p_actor: req.profile.id,
        p_order: existing.id,
        p_delivery_status: finalDeliveryStatus,
        p_payment_status: existing.payment_method === 'cod' ? 'paid' : existing.payment_status,
      });
      if (error) {
        if (['PGRST202', '42883'].includes(error.code)) {
          throw new ApiError('Inventory safeguards are not configured. Please contact support.', 503);
        }
        throw new ApiError(error.message, error.code === '42501' ? 403 : error.code === 'P0002' ? 404 : 409);
      }
      order = { ...existing, ...data, delivery_status: 'completed', status: 'completed' };
    } else {
      const { data, error } = await supabaseAdmin
        .from('orders')
        .update({
          delivery_status: 'completed',
          status: 'completed',
          payment_status: existing.payment_method === 'cod' ? 'paid' : existing.payment_status,
          ...(existing.payment_method === 'cod' && existing.payment_status !== 'paid' ? { paid_at: now } : {}),
          completed_at: now,
          updated_at: now,
        })
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw new ApiError(error.message, 400);
      order = data;
    }
  } else {
    const { data, error } = await supabaseAdmin
      .from('orders')
      .update({
        delivery_status: nextStatus,
        ...(nextStatus === 'in_transit' ? { transit_started_at: now } : {}),
        updated_at: now,
      })
      .eq('id', existing.id)
      .eq('status', existing.status)
      .eq('delivery_status', existing.delivery_status)
      .select()
      .maybeSingle();
    if (error) throw new ApiError(error.message, 400);
    if (!data) throw new ApiError('Order progress changed. Refresh before trying again.', 409);
    order = data;
  }

  const eventCopy = WHOLESALE_EVENT_COPY[nextStatus];
  if (eventCopy) {
    await supabaseAdmin.from('order_delivery_events').insert({
      order_id: order.id,
      status: nextStatus,
      title: eventCopy.title,
      description: eventCopy.description,
      source: isCompletionStep ? 'buyer' : 'farmer',
    });

    if (isCompletionStep) {
      await createNotification({
        userId: order.farmer_id,
        type: 'order',
        title: 'Order completed',
        message: eventCopy.notifyMessage(order),
        link: `/orders/${order.id}`,
      });
      await createNotification({
        userId: order.buyer_id,
        type: 'order',
        title: 'Order completed',
        message: `You have successfully confirmed receipt of your ${isWholesaleOrder(order) ? 'wholesale' : 'Lalamove'} order for ${order.product_name}.`,
        link: `/orders/${order.id}`,
      });
    } else {
      await createNotification({
        userId: order.buyer_id,
        type: 'order',
        title: eventCopy.notifyTitle,
        message: eventCopy.notifyMessage(order),
        link: `/orders/${order.id}`,
      });
    }
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
