import { haversineKm } from './geo.js';

export const ARRIVAL_GEOFENCE_RADIUS_METERS = 80;
export const APPROACHING_FARM_RADIUS_METERS = 500;
export const MAX_ARRIVAL_GPS_ACCURACY_METERS = 65;
export const REQUIRED_CONSECUTIVE_ARRIVAL_READINGS = 2;
export const DONATION_ARRIVAL_POKE_COOLDOWN_MS = 60_000;

export const FARMER_ARRIVAL_NOTIFICATION_TITLE = 'Donation Handover Confirmation Needed';
export const FARMER_ARRIVAL_NOTIFICATION_MESSAGE =
  'The Stakeholder reports arriving at your farm for pickup. Review the donation and confirm the handover.';

export function validCoordinatePair(coords) {
  if (!coords || typeof coords !== 'object') return false;
  const lat = Number(coords.lat);
  const lng = Number(coords.lng);
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

export function evaluateDonationArrival({
  previousReadings = 0,
  arrivedAt = null,
  sample,
  farmCoords,
  now = new Date().toISOString(),
} = {}) {
  const alreadyArrived = Boolean(arrivedAt);
  const prevCount = Math.max(0, Number(previousReadings) || 0);

  if (!validCoordinatePair(sample) || !validCoordinatePair(farmCoords)) {
    return {
      distanceKm: null,
      distanceMeters: null,
      isApproaching: false,
      hasReliableAccuracy: false,
      isReliableWithinGeofence: false,
      consecutiveArrivalReadings: alreadyArrived
        ? Math.max(REQUIRED_CONSECUTIVE_ARRIVAL_READINGS, prevCount)
        : 0,
      arrived: alreadyArrived,
      newlyArrived: false,
      arrivedAt: alreadyArrived ? arrivedAt : null,
      pickupStatus: alreadyArrived ? 'awaiting_confirmation' : 'on_the_way',
    };
  }

  const distanceKm = haversineKm(
    { lat: Number(sample.lat), lng: Number(sample.lng) },
    { lat: Number(farmCoords.lat), lng: Number(farmCoords.lng) },
  );
  const distanceMeters = distanceKm * 1000;
  const accuracy =
    sample.accuracy == null || sample.accuracy === '' ? null : Number(sample.accuracy);
  const hasReliableAccuracy =
    typeof accuracy === 'number' &&
    Number.isFinite(accuracy) &&
    accuracy >= 0 &&
    accuracy <= MAX_ARRIVAL_GPS_ACCURACY_METERS;

  const isInsideGeofence =
    Number.isFinite(distanceMeters) &&
    distanceMeters <= ARRIVAL_GEOFENCE_RADIUS_METERS &&
    (accuracy == null || distanceMeters + accuracy * 0.5 <= ARRIVAL_GEOFENCE_RADIUS_METERS + 25);

  const isReliableWithinGeofence = hasReliableAccuracy && isInsideGeofence;
  const isApproaching =
    Number.isFinite(distanceMeters) && distanceMeters <= APPROACHING_FARM_RADIUS_METERS;

  if (alreadyArrived) {
    return {
      distanceKm,
      distanceMeters,
      isApproaching,
      hasReliableAccuracy,
      isReliableWithinGeofence,
      consecutiveArrivalReadings: Math.max(
        REQUIRED_CONSECUTIVE_ARRIVAL_READINGS,
        isReliableWithinGeofence ? prevCount + 1 : prevCount,
      ),
      arrived: true,
      newlyArrived: false,
      arrivedAt,
      pickupStatus: 'awaiting_confirmation',
    };
  }

  const consecutiveArrivalReadings = isReliableWithinGeofence ? prevCount + 1 : 0;
  const newlyArrived = consecutiveArrivalReadings >= REQUIRED_CONSECUTIVE_ARRIVAL_READINGS;
  const arrived = newlyArrived;

  return {
    distanceKm,
    distanceMeters,
    isApproaching,
    hasReliableAccuracy,
    isReliableWithinGeofence,
    consecutiveArrivalReadings,
    arrived,
    newlyArrived,
    arrivedAt: newlyArrived ? now : null,
    pickupStatus: newlyArrived ? 'awaiting_confirmation' : 'on_the_way',
  };
}
