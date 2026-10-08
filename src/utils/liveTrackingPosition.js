import { haversineKm, isReliableTrackingAccuracy, validateCoordinates } from './geo';

export const LIVE_LOCATION_FRESHNESS_MS = 3 * 60 * 1000;

export function locationTimestamp(value) {
  if (value == null || value === '') return null;
  const numeric = typeof value === 'number' || /^\d+(\.\d+)?$/.test(value) ? Number(value) : NaN;
  const milliseconds = Number.isFinite(numeric)
    ? (numeric < 1e12 ? numeric * 1000 : numeric)
    : Date.parse(value);
  return Number.isFinite(milliseconds) && milliseconds > 0 ? milliseconds : null;
}

// Keep the device acquisition time separate from the server/client clocks.
export function normalizeLivePosition(payload, { receivedAt = Date.now(), serverNow } = {}) {
  if (!payload) return null;
  const point = validateCoordinates(payload.lat, payload.lng);
  if (!point || !isReliableTrackingAccuracy(payload.accuracy)) return null;
  const timestamp = locationTimestamp(payload.timestamp);
  const updatedAt = locationTimestamp(payload.locationUpdatedAt) ?? timestamp;
  if (updatedAt == null) return null;
  const serverTime = locationTimestamp(serverNow);
  const observedAt = Number.isFinite(payload.observedAt) ? payload.observedAt
    : serverTime != null ? receivedAt - Math.max(0, serverTime - updatedAt) : updatedAt;
  const optionalNumber = (value) => value != null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
  return {
    ...point,
    accuracy: optionalNumber(payload.accuracy),
    heading: optionalNumber(payload.heading),
    deviceHeading: optionalNumber(payload.deviceHeading),
    speed: optionalNumber(payload.speed),
    timestamp,
    locationUpdatedAt: new Date(updatedAt).toISOString(),
    observedAt,
  };
}

export function isFreshLivePosition(position, now = Date.now()) {
  const time = position?.observedAt ?? locationTimestamp(position?.locationUpdatedAt ?? position?.timestamp);
  return time != null && now - time <= LIVE_LOCATION_FRESHNESS_MS && time <= now + 5000;
}

export function positionFromOrder(order) {
  return normalizeLivePosition({
    lat: order?.currentLat, lng: order?.currentLng, accuracy: order?.currentAccuracy,
    heading: order?.currentHeading, speed: order?.currentSpeed,
    locationUpdatedAt: order?.locationUpdatedAt,
  });
}

// Hold a previously confirmed point only for stationary noise within GPS accuracy.
export function stableTrackingPosition(previous, next) {
  if (!previous || (previous.speed ?? 0) > 0.8 || (next.speed ?? 0) > 0.8) return next;
  const toleranceM = Math.min(8, previous.accuracy ?? 0, next.accuracy ?? 0);
  if (toleranceM <= 0 || haversineKm(previous, next) * 1000 > toleranceM) return next;
  return { ...next, lat: previous.lat, lng: previous.lng, heading: previous.heading };
}
