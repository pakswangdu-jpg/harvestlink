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

export function getInitials(nameOrEmail = '') {
  const parts = String(nameOrEmail).trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return String(nameOrEmail).slice(0, 2).toUpperCase() || 'HL';
}

export function getFirstName(name = '') {
  return String(name).trim().split(/\s+/)[0] || name;
}

const MAX_IMAGE_DIMENSION = 1000;
const IMAGE_QUALITY = 0.75;

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Unable to read file.'));
    reader.readAsDataURL(file);
  });
}

// Downscales and re-encodes images before they're stored as data URLs. This app keeps
// everything — every user, product, order, and image alike — in localStorage, which caps
// out around 5-10MB per origin, so an unmodified photo straight from a phone camera (often
// several MB on its own) can exhaust that shared quota after just a couple of uploads.
// Capping the longest side and re-encoding as JPEG brings a typical photo down to a few
// hundred KB. PDFs (accepted alongside images for ID/accreditation uploads) can't be
// resized this way, so they're read through unchanged.
export async function fileToDataUrl(file) {
  if (!file) return '';
  if (!file.type.startsWith('image/')) return readFileAsDataUrl(file);

  const rawDataUrl = await readFileAsDataUrl(file);

  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Unable to read image file.'));
    img.src = rawDataUrl;
  });

  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(image.width, image.height));
  const width = Math.round(image.width * scale);
  const height = Math.round(image.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(image, 0, 0, width, height);

  const compressed = canvas.toDataURL('image/jpeg', IMAGE_QUALITY);
  // A canvas re-encode can occasionally end up larger than the original for an
  // already small/heavily-compressed source — keep whichever is actually smaller.
  return compressed.length < rawDataUrl.length ? compressed : rawDataUrl;
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
