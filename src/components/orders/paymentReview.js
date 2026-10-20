export const PAYMENT_REVIEW_CHECKS = [
  'Receipt amount matches order amount',
  'Reference number is readable',
  'Sender/payment information is valid',
  'Receipt does not appear duplicated',
];

export const PAYMENT_REJECTION_REASONS = [
  'Amount does not match', 'Receipt unreadable', 'Invalid reference number', 'Duplicate receipt', 'Other',
];

export function paymentReviewKey(order) {
  return JSON.stringify([order.id, order.totalAmount, order.paymentMethod, order.paymentStatus,
    order.paymentVerificationStatus, order.paymentReceiptUrl, order.paymentReferenceNumber,
    order.paymentSenderName, order.paymentSubmittedAt, order.paymentNotes]);
}

export function receiptPreviewUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? value.trim() : null;
  } catch { return null; }
}

export function canReviewPayment(order, { readOnly, onApprove, onReject }) {
  return !readOnly && typeof onApprove === 'function' && typeof onReject === 'function'
    && order.paymentMethod === 'gcash' && order.paymentStatus === 'pending' && order.paymentVerificationStatus === 'pending';
}

export function paymentRejectionReason(category, note) {
  if (!PAYMENT_REJECTION_REASONS.includes(category)) return '';
  const details = note.trim();
  return category === 'Other' ? details : `${category}${details ? `: ${details}` : ''}`;
}
