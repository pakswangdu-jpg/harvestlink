import { haversineKm } from './geo.js';

const MAX_SAMPLE_GAP_SECONDS = 60;
const MAX_SPEED_MPS = 50;

function validSpeed(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_SPEED_MPS;
}

export function accumulateTripTelemetry(order, sample, locationUpdatedAt) {
  const totals = {
    tracked_distance_km: Number(order.tracked_distance_km) || 0,
    tracked_duration_seconds: Number(order.tracked_duration_seconds) || 0,
  };
  if (order.current_lat == null || order.current_lng == null || !order.location_updated_at) return totals;
  const seconds = (Date.parse(locationUpdatedAt) - Date.parse(order.location_updated_at)) / 1000;
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > MAX_SAMPLE_GAP_SECONDS) return totals;

  const displacementKm = haversineKm(
    { lat: Number(order.current_lat), lng: Number(order.current_lng) }, sample,
  );
  if (!Number.isFinite(displacementKm) || displacementKm * 1000 / seconds > MAX_SPEED_MPS) return totals;

  let distanceKm;
  if (validSpeed(order.current_speed) && validSpeed(sample.speed)) {
    distanceKm = (order.current_speed + sample.speed) / 2 * seconds / 1000;
  } else {
    // Without device speed, count only displacement beyond the GPS accuracy noise.
    if (order.current_accuracy == null || sample.accuracy == null) return totals;
    const noiseKm = Math.max(Number(order.current_accuracy), sample.accuracy) / 1000;
    distanceKm = displacementKm > noiseKm ? displacementKm : 0;
  }
  return {
    tracked_distance_km: totals.tracked_distance_km + distanceKm,
    tracked_duration_seconds: totals.tracked_duration_seconds + seconds,
  };
}
