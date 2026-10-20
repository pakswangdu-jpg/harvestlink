const PAYMENT_LABELS = { gcash: 'GCash', cod: 'Cash on Delivery' };
const DELIVERY_LABELS = { farmer_delivery: 'Farmer delivery', buyer_pickup: 'Buyer pickup', courier: 'Third-party courier' };
const money = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export function isFinalReceiptReady(order) {
  return order.status === 'completed' && order.paymentStatus === 'paid'
    && (order.deliveryMethod === 'buyer_pickup' ? order.deliveryStatus === 'picked_up'
      : ['farmer_delivery', 'courier'].includes(order.deliveryMethod) && order.deliveryStatus === 'delivered')
    && (order.paymentMethod === 'cod' || (order.paymentMethod === 'gcash' && order.paymentVerificationStatus === 'approved'));
}

export function buildReceipt(order, { buyerEmail = null, completedAt = null, delivery = null } = {}) {
  const values = [order.unitPrice, order.quantity, order.deliveryFee, order.totalAmount];
  const subtotal = money(Number(order.unitPrice) * Number(order.quantity));
  if (values.some(value => value == null || value === '' || !Number.isFinite(Number(value)) || Number(value) < 0)
    || Number(order.quantity) <= 0 || Math.abs(money(subtotal + Number(order.deliveryFee)) - Number(order.totalAmount)) > 0.005) {
    const error = new Error('The saved receipt amounts could not be verified. Please contact support.');
    error.code = 'RECEIPT_DATA_INVALID';
    throw error;
  }
  return {
    orderId: order.id,
    orderNumber: String(order.id).slice(0, 8).toUpperCase(),
    final: isFinalReceiptReady(order),
    createdAt: order.createdAt,
    completedAt: order.completedAt || completedAt || null,
    buyer: { name: order.buyerName, email: buyerEmail },
    seller: { name: order.farmerName, farmName: order.farmerFarmName || null },
    items: [{ name: order.productName, quantity: Number(order.quantity), unit: order.unit, unitPrice: Number(order.unitPrice), total: subtotal }],
    subtotal,
    deliveryFee: Number(order.deliveryFee),
    total: Number(order.totalAmount),
    payment: {
      method: PAYMENT_LABELS[order.paymentMethod] || order.paymentMethod,
      status: { paid: 'Paid', pending: 'Payment pending', failed: 'Payment failed', refunded: 'Refunded' }[order.paymentStatus] || 'Not recorded',
      verified: order.paymentMethod === 'gcash' && order.paymentVerificationStatus === 'approved',
      reference: order.paymentReferenceNumber || null,
    },
    delivery: {
      method: order.deliveryMethod === 'courier' && delivery?.courier_company === 'Lalamove' ? 'Lalamove' : DELIVERY_LABELS[order.deliveryMethod] || order.deliveryMethod,
      status: { delivered: 'Delivered', picked_up: 'Picked up', pending: 'Pending', preparing: 'Preparing', packed: 'Packed', ready_for_pickup: 'Ready for pickup', out_for_delivery: 'Out for delivery', cancelled: 'Cancelled' }[order.deliveryStatus] || 'Not recorded',
      bookingReference: delivery?.booking_reference || null,
    },
  };
}

export function receiptCurrency(value) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value);
}

export function receiptDate(value, withTime = false) {
  if (!value || !Number.isFinite(new Date(value).getTime())) return 'Not recorded';
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  }).format(new Date(value));
}
