import { DELIVERY_SEQUENCES, matchMunicipality, ONLINE_PAYMENT_METHODS, STORAGE_KEYS } from '../utils/constants';
import { createId, migrateLegacyOrders, readStorage, writeStorage } from './storageService';
import { getProductById, reduceProductQuantity, restoreProductQuantity } from './productService';

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
  return updatedOrders.find((order) => order.id === id);
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
