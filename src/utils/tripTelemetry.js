export function getRecordedAverageSpeedKmh(order) {
  const distance = order.trackedDistanceKm;
  const seconds = order.trackedDurationSeconds;
  return Number.isFinite(distance) && distance >= 0 && Number.isFinite(seconds) && seconds > 0
    ? distance / seconds * 3600
    : null;
}
