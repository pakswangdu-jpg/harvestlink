export const PHILIPPINES_TIMEZONE = 'Asia/Manila';
export const EXPIRING_SOON_DAYS = 3;

export const EXPIRED_PRODUCT_ERROR_CODE = 'PRODUCT_EXPIRED';
export const EXPIRED_PRODUCT_ERROR_TITLE = 'Product No Longer Available';
export const EXPIRED_PRODUCT_ERROR_MESSAGE = 'This product has reached its expiration date and is no longer available for purchase. Please browse other available products.';

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86400000;

export function getTodayInPhilippines(now = new Date()) {
  const date = now instanceof Date ? now : new Date(now);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: PHILIPPINES_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function normalizeExpirationDate(value) {
  if (!value) return null;
  const candidate = String(value).trim().slice(0, 10);
  const match = DATE_ONLY_PATTERN.exec(candidate);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (
    utc.getUTCFullYear() !== year
    || utc.getUTCMonth() !== month - 1
    || utc.getUTCDate() !== day
  ) {
    return null;
  }
  return candidate;
}

function dateStringToUtcMs(dateString) {
  const [year, month, day] = dateString.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

export function getDaysUntilExpiration(expirationDate, now = new Date()) {
  const normalized = normalizeExpirationDate(expirationDate);
  if (!normalized) return null;
  const today = getTodayInPhilippines(now);
  return Math.round((dateStringToUtcMs(normalized) - dateStringToUtcMs(today)) / MS_PER_DAY);
}

export function isProductExpired(expirationDate, now = new Date()) {
  if (!expirationDate) return false;
  const normalized = normalizeExpirationDate(expirationDate);
  if (!normalized) return false;
  const daysRemaining = getDaysUntilExpiration(normalized, now);
  return daysRemaining !== null && daysRemaining < 0;
}

export function isProductExpiringSoon(expirationDate, now = new Date()) {
  const daysRemaining = getDaysUntilExpiration(expirationDate, now);
  return daysRemaining !== null && daysRemaining >= 0 && daysRemaining <= EXPIRING_SOON_DAYS;
}

export function formatExpirationDate(expirationDate) {
  const normalized = normalizeExpirationDate(expirationDate);
  if (!normalized) return 'Not specified';
  const utcDate = new Date(dateStringToUtcMs(normalized));
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(utcDate);
}

export function getProductExpirationInfo(expirationDate, now = new Date()) {
  const normalized = normalizeExpirationDate(expirationDate);
  if (!normalized) {
    return {
      status: 'none',
      dateString: null,
      formattedDate: 'Not specified',
      daysRemaining: null,
      indicatorText: null,
      detailText: null,
      isExpired: false,
      isExpiringSoon: false,
    };
  }

  const daysRemaining = getDaysUntilExpiration(normalized, now);
  const formattedDate = formatExpirationDate(normalized);

  if (daysRemaining < 0) {
    const daysAgo = Math.abs(daysRemaining);
    return {
      status: 'expired',
      dateString: normalized,
      formattedDate,
      daysRemaining,
      indicatorText: 'Expired',
      detailText: daysAgo === 1 ? 'Expired 1 day ago' : `Expired ${daysAgo} days ago`,
      isExpired: true,
      isExpiringSoon: false,
    };
  }

  if (daysRemaining <= EXPIRING_SOON_DAYS) {
    const detailText = daysRemaining === 0
      ? 'Expires today'
      : daysRemaining === 1
        ? '1 day left'
        : `${daysRemaining} days left`;
    return {
      status: 'expiring-soon',
      dateString: normalized,
      formattedDate,
      daysRemaining,
      indicatorText: 'Expiring Soon',
      detailText,
      isExpired: false,
      isExpiringSoon: true,
    };
  }

  return {
    status: 'fresh',
    dateString: normalized,
    formattedDate,
    daysRemaining,
    indicatorText: `${daysRemaining} days left`,
    detailText: `${daysRemaining} days left`,
    isExpired: false,
    isExpiringSoon: false,
  };
}
