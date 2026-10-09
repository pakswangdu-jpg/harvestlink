import { deliveryStepLabel, paymentStatusLabel } from '../../utils/formatters';

export const ORDER_STATUSES = ['pending', 'confirmed', 'completed', 'cancelled', 'rejected'];
export const DELIVERY_STAGES = ['pending', 'preparing', 'packed', 'out_for_delivery', 'ready_for_pickup', 'delivered', 'picked_up', 'cancelled'];
export const orderLabel = (status) => status ? status[0].toUpperCase() + status.slice(1) : 'Not recorded';
export const adminOrderId = (id) => `#HL-${String(id).slice(0, 6).toUpperCase()}`;
export function progressLabel(order) {
  if (order.status === 'pending') return 'Awaiting confirmation';
  if (order.status === 'rejected') return 'Not started';
  if (order.status === 'cancelled') return 'Cancelled';
  return deliveryStepLabel(order.deliveryStatus) || 'Not recorded';
}
export function paymentState(order) {
  if (order.paymentStatus === 'paid') return 'Paid';
  return order.paymentStatus === 'pending' ? 'Payment pending' : paymentStatusLabel(order.paymentStatus) || 'Not recorded';
}
export function verificationState(order) {
  if (order.paymentMethod !== 'gcash') return null;
  if (order.paymentVerificationStatus === 'approved') return 'Payment verified';
  if (order.paymentVerificationStatus === 'rejected') return 'Payment rejected';
  if (order.paymentSubmittedAt || order.paymentReceiptUrl) return 'Receipt submitted - under verification';
  return 'Awaiting receipt';
}
