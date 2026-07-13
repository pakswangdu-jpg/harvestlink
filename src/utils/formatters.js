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

export function formatRelativeTime(value) {
  if (!value) return '';
  const diffMinutes = Math.floor((Date.now() - new Date(value).getTime()) / 60000);
  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(value);
}

// Duration, not a timestamp — "~2h 15m" / "~45 mins" — used for the upfront "estimated
// delivery" figure (see getLiveTransitProgress's estimatedTotalMinutes).
export function formatDurationMinutes(minutes) {
  const rounded = Math.max(1, Math.round(minutes));
  if (rounded < 60) return `${rounded} min${rounded === 1 ? '' : 's'}`;
  const hours = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

// "Online" here means "the backend saw an authenticated request from this account within
// the last ONLINE_THRESHOLD_MINUTES" (see backend/src/middleware/requireAuth.js, which
// touches last_active_at on every authenticated request, throttled to ~once/minute). Set
// a little above that throttle window so a genuinely-active account doesn't flicker
// offline between writes.
const ONLINE_THRESHOLD_MINUTES = 2;

export function isRecentlyActive(lastActiveAt) {
  if (!lastActiveAt) return false;
  return (Date.now() - new Date(lastActiveAt).getTime()) / 60000 < ONLINE_THRESHOLD_MINUTES;
}

export function getInitials(nameOrEmail = '') {
  const parts = String(nameOrEmail).trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return String(nameOrEmail).slice(0, 2).toUpperCase() || 'HL';
}

export function getFirstName(name = '') {
  return String(name).trim().split(/\s+/)[0] || name;
}

// A full UUID is correct but unwieldy to read/quote aloud on a receipt or tracking page —
// the first 8 characters (uppercased) are unique enough for a human-facing reference, while
// every link/API call still uses the full id underneath.
export function shortOrderId(id) {
  return String(id).slice(0, 8).toUpperCase();
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

const STATUS_TONE_GOOD = ['active', 'confirmed', 'farmer', 'paid', 'completed', 'delivered', 'picked_up', 'scheduled', 'available', 'approved', 'verified'];
const STATUS_TONE_WARNING = ['pending', 'preparing', 'packed', 'out_for_delivery', 'ready_for_pickup', 'requested'];
const STATUS_TONE_CRITICAL = ['rejected', 'inactive', 'failed', 'cancelled', 'refunded', 'declined', 'suspended'];

// Mirrors the .badge-* color groups in globals.css, so a report chart's bar color
// always agrees with what that same status looks like as a badge elsewhere in the app.
export function statusTone(value) {
  if (STATUS_TONE_GOOD.includes(value)) return 'good';
  if (STATUS_TONE_WARNING.includes(value)) return 'warning';
  if (STATUS_TONE_CRITICAL.includes(value)) return 'critical';
  return 'neutral';
}
