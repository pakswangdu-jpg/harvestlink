import { DELIVERY_STEP_LABELS } from './constants';

export function formatCurrency(value) {
  const number = Number(value || 0);
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 2,
  }).format(number);
}

export function formatDate(value) {
  if (!value) return 'Not available';
  return new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}

export function getInitials(nameOrEmail = '') {
  const parts = String(nameOrEmail).trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return String(nameOrEmail).slice(0, 2).toUpperCase() || 'HL';
}

export function getFirstName(name = '') {
  return String(name).trim().split(/\s+/)[0] || name;
}

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve('');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Unable to read image file.'));
    reader.readAsDataURL(file);
  });
}

const PAYMENT_METHOD_LABELS = {
  cod: 'Cash on delivery',
  gcash: 'GCash',
  maya: 'Maya',
  card: 'Card',
  bank: 'Bank transfer',
};

const PAYMENT_STATUS_LABELS = {
  pending: 'Payment pending',
  paid: 'Paid',
  failed: 'Payment failed',
  refunded: 'Refunded',
};

const DELIVERY_METHOD_LABELS = {
  farmer_delivery: 'Farmer delivery',
  buyer_pickup: 'Buyer pickup',
  courier: 'Third-party courier',
};

const DONATION_STATUS_LABELS = {
  available: 'Available',
  requested: 'Requested',
  scheduled: 'Pickup scheduled',
  completed: 'Donation completed',
  cancelled: 'Cancelled',
};

const PRICE_REVIEW_STATUS_LABELS = {
  pending: 'Pending DTI review',
  approved: 'Approved by DTI',
  declined: 'Declined by DTI',
};

const VERIFICATION_STATUS_LABELS = {
  pending: 'Pending verification',
  verified: 'Verified',
  rejected: 'Verification rejected',
};

export function paymentLabel(value) {
  return PAYMENT_METHOD_LABELS[value] || value;
}

export function paymentStatusLabel(value) {
  return PAYMENT_STATUS_LABELS[value] || value;
}

export function deliveryMethodLabel(value) {
  return DELIVERY_METHOD_LABELS[value] || value;
}

export function deliveryStepLabel(value) {
  return DELIVERY_STEP_LABELS[value] || value;
}

export function donationStatusLabel(value) {
  return DONATION_STATUS_LABELS[value] || value;
}

export function priceReviewStatusLabel(value) {
  return PRICE_REVIEW_STATUS_LABELS[value] || value;
}

export function verificationStatusLabel(value) {
  return VERIFICATION_STATUS_LABELS[value] || value;
}
