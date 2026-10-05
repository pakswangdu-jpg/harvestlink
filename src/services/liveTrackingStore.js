import { isFreshLivePosition, locationTimestamp, normalizeLivePosition } from '../utils/liveTrackingPosition';

// One in-memory position per order, shared by the existing GPS watcher and map consumers.
const positions = new Map();
const listeners = new Map();

export function getLiveOrderPosition(orderId) {
  return positions.get(orderId) ?? null;
}

export function subscribeLiveOrderPosition(orderId, listener) {
  if (!listeners.has(orderId)) listeners.set(orderId, new Set());
  listeners.get(orderId).add(listener);
  return () => {
    listeners.get(orderId)?.delete(listener);
    if (!listeners.get(orderId)?.size) {
      listeners.delete(orderId);
      if (positions.get(orderId)?.source !== 'gps') positions.delete(orderId);
    }
  };
}

export function publishLiveOrderPosition(orderId, payload, options = {}) {
  if (!orderId) return null;
  const next = normalizeLivePosition(payload, options);
  if (!next) return null;
  const previous = positions.get(orderId);
  // Server-normalized snapshot times cannot be ordered against the phone clock.
  // A fresh local acquisition takes over from a persisted/replayed position.
  const freshDeviceFix = options.source === 'gps' && previous?.source !== 'gps'
    && isFreshLivePosition(next);
  if (previous && !freshDeviceFix) {
    // Delayed HTTP/DB snapshots or echoes cannot replace a newer local GPS fix.
    if (previous.timestamp != null && next.timestamp != null) {
      if (next.timestamp <= previous.timestamp) return previous;
    } else if (previous.source === 'gps' && isFreshLivePosition(previous)) {
      return previous;
    } else if (locationTimestamp(next.locationUpdatedAt) < locationTimestamp(previous.locationUpdatedAt)
      || (locationTimestamp(next.locationUpdatedAt) === locationTimestamp(previous.locationUpdatedAt)
        && !(previous.source === 'persisted' && options.serverNow != null))) {
      return previous;
    }
  }
  const value = { ...next, source: options.source || 'socket' };
  positions.set(orderId, value);
  listeners.get(orderId)?.forEach((listener) => listener());
  return value;
}

export function clearLiveOrderPositions() {
  positions.clear();
  listeners.forEach((subscribers) => subscribers.forEach((listener) => listener()));
}
