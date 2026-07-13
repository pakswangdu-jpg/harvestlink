// Frozen, localStorage-backed snapshot of the pre-migration orderService.js — kept only
// so demandForecastService.js (not yet migrated to the backend) still has a synchronous
// getOrders() to call. Do not add new features here.
import { DELIVERY_SEQUENCES, matchMunicipality, ONLINE_PAYMENT_METHODS, STORAGE_KEYS } from '../../utils/constants';
import { haversineKm, resolveRoutePoints } from '../../utils/geo';
import { createId, migrateLegacyOrders, readStorage, writeStorage } from '../storageService';
import { getProductById, reduceProductQuantity, restoreProductQuantity } from './productServiceLocal';
import { getCachedRoadRoute } from '../routingService';
import { createNotification } from './notificationServiceLocal';

const ASSUMED_TRANSIT_SPEED_KMH = 25;
const MIN_ESTIMATED_MINUTES = 5;

// Approximates a live, Maxim/Grab-style tracker on top of a step-based (not real-GPS)
// delivery model: once the order is actually out for delivery, its on-map position and
// ETA advance continuously with real elapsed time since that step started (order.updatedAt)
// against an assumed travel speed, instead of jumping straight to each step's fixed
// fraction the moment a farmer marks it. Buyer pickup has no "in transit" leg — the buyer
// travels there on their own schedule — so it's excluded entirely. Shared by every screen
// that plots a delivery route (order tracking page, farmer/buyer dashboards) so the truck's
// position and ETA agree everywhere it's shown.
export function getLiveTransitProgress(order) {
  const sequence = getDeliverySequence(order.deliveryMethod);
  const stepIndex = Math.max(0, sequence.indexOf(order.deliveryStatus));
  const isFinalStep = stepIndex === sequence.length - 1;
  const isPickup = order.deliveryMethod === 'buyer_pickup';
  const transitStatus = sequence[sequence.length - 2];
  const isInTransit = !isPickup && order.deliveryStatus === transitStatus;

  if (!isInTransit) {
    const progress = sequence.length > 1 ? stepIndex / (sequence.length - 1) : 0;
    return { progress: isFinalStep ? 1 : progress, etaMinutes: null, isInTransit: false };
  }

  const { origin, destination } = resolveRoutePoints({
    id: order.id,
    originMunicipality: order.originMunicipality,
    destinationMunicipality: order.deliveryMunicipality,
    deliveryMethod: order.deliveryMethod,
  });
  // Prefers OSRM's actual driving-time estimate for this road route (populated in the
  // background by the map component's own route fetch) over the straight-line-distance
  // guess — falls back only until that first fetch for this municipality pair resolves.
  const cachedRoute = getCachedRoadRoute(origin, destination);
  const estimatedTotalMinutes = cachedRoute
    ? Math.max(MIN_ESTIMATED_MINUTES, cachedRoute.durationMinutes)
    : Math.max(MIN_ESTIMATED_MINUTES, (haversineKm(origin, destination) / ASSUMED_TRANSIT_SPEED_KMH) * 60);
  const elapsedMinutes = (Date.now() - new Date(order.updatedAt).getTime()) / 60000;
  const transitFraction = Math.min(1, Math.max(0, elapsedMinutes / estimatedTotalMinutes));

  const stepStartProgress = stepIndex / (sequence.length - 1);
  const stepEndProgress = (stepIndex + 1) / (sequence.length - 1);
  const progress = stepStartProgress + (stepEndProgress - stepStartProgress) * transitFraction;
  const etaMinutes = Math.ceil(estimatedTotalMinutes * (1 - transitFraction));

  return { progress, etaMinutes, isInTransit: true };
}

export function getOrders() {
  migrateLegacyOrders();
  return readStorage(STORAGE_KEYS.orders, []);
}

export function saveOrders(orders) {
  return writeStorage(STORAGE_KEYS.orders, orders);
}

export function getOrderById(id) {
  return getOrders().find((order) => order.id === id) || null;
}

export function getOrdersByBuyer(buyerId) {
  return getOrders().filter((order) => order.buyerId === buyerId);
}

export function getOrdersByFarmer(farmerId) {
  return getOrders().filter((order) => order.farmerId === farmerId);
}

export function createOrder(values, product, buyer) {
  const now = new Date().toISOString();
  const isOnlinePayment = ONLINE_PAYMENT_METHODS.includes(values.paymentMethod);

  const order = {
    id: createId('order'),
    productId: product.id,
    productName: product.name,
    unit: product.unit,
    unitPrice: Number(product.price),
    farmerId: product.farmerId,
    farmerName: product.farmerName,
    buyerId: buyer.id,
    buyerName: buyer.name,
    quantity: Number(values.quantity),
    totalAmount: Number(values.quantity) * Number(product.price),
    message: values.message.trim(),
    paymentMethod: values.paymentMethod,
    paymentStatus: isOnlinePayment ? 'paid' : 'pending',
    deliveryMethod: values.deliveryMethod,
    deliveryStatus: 'pending',
    originMunicipality: matchMunicipality(product.location),
    deliveryMunicipality: values.deliveryMethod === 'buyer_pickup' ? matchMunicipality(product.location) : values.deliveryMunicipality,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  };

  saveOrders([order, ...getOrders()]);
  createNotification({
    userId: order.farmerId,
    type: 'order',
    title: 'New order received',
    message: `${order.buyerName} ordered ${order.quantity} ${order.unit} of ${order.productName}.`,
    link: `/orders/${order.id}`,
  });
  return order;
}

export function updateOrderStatus(id, status) {
  const orders = getOrders();
  const target = orders.find((order) => order.id === id);
  if (!target) throw new Error('Order was not found.');
  if (target.status !== 'pending') throw new Error('This order has already been reviewed.');

  if (status === 'confirmed') {
    const product = getProductById(target.productId);
    if (!product) throw new Error('Product was not found.');
    reduceProductQuantity(product.id, target.quantity);
  }

  const updatedOrders = orders.map((order) =>
    order.id === id ? { ...order, status, updatedAt: new Date().toISOString() } : order
  );
  saveOrders(updatedOrders);
  const updatedOrder = updatedOrders.find((order) => order.id === id);
  createNotification({
    userId: updatedOrder.buyerId,
    type: 'order',
    title: status === 'confirmed' ? 'Order confirmed' : 'Order rejected',
    message: status === 'confirmed'
      ? `${updatedOrder.farmerName} confirmed your order for ${updatedOrder.productName}.`
      : `${updatedOrder.farmerName} rejected your order for ${updatedOrder.productName}.`,
    link: `/orders/${updatedOrder.id}`,
  });
  return updatedOrder;
}

export function isCancellable(order) {
  return order.status === 'pending' || (order.status === 'confirmed' && order.deliveryStatus === 'pending');
}

export function cancelOrder(id) {
  const orders = getOrders();
  const target = orders.find((order) => order.id === id);
  if (!target) throw new Error('Order was not found.');
  if (!isCancellable(target)) throw new Error('This order can no longer be cancelled.');

  // Stock was only deducted once the order was confirmed — give it back on cancellation.
  if (target.status === 'confirmed') {
    restoreProductQuantity(target.productId, target.quantity);
  }

  const updatedOrders = orders.map((order) =>
    order.id === id ? { ...order, status: 'cancelled', deliveryStatus: 'cancelled', updatedAt: new Date().toISOString() } : order
  );
  saveOrders(updatedOrders);
  return updatedOrders.find((order) => order.id === id);
}

export function getDeliverySequence(deliveryMethod) {
  return DELIVERY_SEQUENCES[deliveryMethod] || DELIVERY_SEQUENCES.farmer_delivery;
}

export function getNextDeliveryStatus(order) {
  const sequence = getDeliverySequence(order.deliveryMethod);
  const currentIndex = sequence.indexOf(order.deliveryStatus);
  if (currentIndex === -1 || currentIndex === sequence.length - 1) return null;
  return sequence[currentIndex + 1];
}

export function advanceDelivery(id) {
  const orders = getOrders();
  const target = orders.find((order) => order.id === id);
  if (!target) throw new Error('Order was not found.');
  if (target.status !== 'confirmed') throw new Error('Only confirmed orders can be advanced.');

  const nextStatus = getNextDeliveryStatus(target);
  if (!nextStatus) throw new Error('This order has already reached its final delivery step.');

  const sequence = getDeliverySequence(target.deliveryMethod);
  const isFinalStep = nextStatus === sequence[sequence.length - 1];
  const now = new Date().toISOString();

  const updatedOrders = orders.map((order) => {
    if (order.id !== id) return order;
    return {
      ...order,
      deliveryStatus: nextStatus,
      status: isFinalStep ? 'completed' : order.status,
      paymentStatus: isFinalStep && order.paymentMethod === 'cod' ? 'paid' : order.paymentStatus,
      updatedAt: now,
    };
  });

  saveOrders(updatedOrders);
  return updatedOrders.find((order) => order.id === id);
}

export function payOrder(id) {
  const orders = getOrders();
  const target = orders.find((order) => order.id === id);
  if (!target) throw new Error('Order was not found.');

  const updatedOrders = orders.map((order) =>
    order.id === id ? { ...order, paymentStatus: 'paid', updatedAt: new Date().toISOString() } : order
  );
  saveOrders(updatedOrders);
  return updatedOrders.find((order) => order.id === id);
}
