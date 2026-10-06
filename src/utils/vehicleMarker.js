export const VEHICLE_HEADING_MIN_MOVEMENT_KM = 0.008;
export const VEHICLE_MARKER_ANIMATION_DURATION_MS = 700;
export const VEHICLE_MARKER_WIDTH_PX = 28;
export const VEHICLE_MARKER_HEIGHT_PX = 48;

export async function requestDeviceOrientationPermission() {
  if (typeof window === 'undefined') return false;
  const orientationEvent = window.DeviceOrientationEvent;
  if (typeof orientationEvent?.requestPermission !== 'function') return true;
  try {
    return (await orientationEvent.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}

const EARTH_RADIUS_KM = 6371;

function haversineKm(from, to) {
  const toRad = (degrees) => (degrees * Math.PI) / 180;
  const latitudeDelta = toRad(to.lat - from.lat);
  const longitudeDelta = toRad(to.lng - from.lng);
  const fromLatitude = toRad(from.lat);
  const toLatitude = toRad(to.lat);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function computeVehicleBearing(from, to) {
  const toRad = (degrees) => (degrees * Math.PI) / 180;
  const toDeg = (radians) => (radians * 180) / Math.PI;
  const longitudeDelta = toRad(to.lng - from.lng);
  const fromLatitude = toRad(from.lat);
  const toLatitude = toRad(to.lat);
  const y = Math.sin(longitudeDelta) * Math.cos(toLatitude);
  const x = Math.cos(fromLatitude) * Math.sin(toLatitude)
    - Math.sin(fromLatitude) * Math.cos(toLatitude) * Math.cos(longitudeDelta);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export function getContinuousVehicleHeading(currentHeading, targetHeading) {
  const normalizedCurrent = ((currentHeading % 360) + 360) % 360;
  const normalizedTarget = ((targetHeading % 360) + 360) % 360;
  const shortestDelta = ((normalizedTarget - normalizedCurrent + 540) % 360) - 180;
  return currentHeading + shortestDelta;
}

export function normalizeVehicleHeading(heading) {
  if (!Number.isFinite(heading)) return null;
  return ((heading % 360) + 360) % 360;
}

export function getDeviceCompassHeading(event, screenAngle = 0, absoluteEvent = false) {
  if (Number.isFinite(event?.webkitCompassHeading)) {
    if (Number.isFinite(event.webkitCompassAccuracy) && event.webkitCompassAccuracy < 0) return null;
    return normalizeVehicleHeading(event.webkitCompassHeading);
  }

  if (event?.absolute !== true && !absoluteEvent) return null;
  if (!Number.isFinite(event.alpha)) return null;

  return normalizeVehicleHeading(360 - event.alpha + screenAngle);
}

export function smoothVehicleHeading(currentHeading, nextHeading, smoothing = 0.25) {
  const normalizedNext = normalizeVehicleHeading(nextHeading);
  if (normalizedNext == null) return normalizeVehicleHeading(currentHeading);
  const normalizedCurrent = normalizeVehicleHeading(currentHeading);
  if (normalizedCurrent == null) return normalizedNext;
  const continuousNext = getContinuousVehicleHeading(normalizedCurrent, normalizedNext);
  return normalizeVehicleHeading(normalizedCurrent + (continuousNext - normalizedCurrent) * smoothing);
}

export function resolveVehicleHeading({
  previousPosition,
  currentPosition,
  lastHeading = 0,
  deviceHeading,
  gpsHeading,
}) {
  const movedEnough = !previousPosition
    || haversineKm(previousPosition, currentPosition) >= VEHICLE_HEADING_MIN_MOVEMENT_KM;
  const shouldUpdateReference = movedEnough;

  if (movedEnough && normalizeVehicleHeading(gpsHeading) != null) {
    return { heading: normalizeVehicleHeading(gpsHeading), shouldUpdateReference };
  }

  if (movedEnough && previousPosition) {
    return { heading: computeVehicleBearing(previousPosition, currentPosition), shouldUpdateReference };
  }

  if (movedEnough && normalizeVehicleHeading(deviceHeading) != null) {
    return { heading: normalizeVehicleHeading(deviceHeading), shouldUpdateReference };
  }

  return { heading: normalizeVehicleHeading(lastHeading) ?? 0, shouldUpdateReference: false };
}

export function buildVehicleMarkerSvg(iconUrl, headingDeg = 0, previousHeadingDeg) {
  const animatedHeading = Number.isFinite(previousHeadingDeg)
    ? getContinuousVehicleHeading(previousHeadingDeg, headingDeg)
    : headingDeg;
  const headingAnimation = Number.isFinite(previousHeadingDeg)
    ? `<animateTransform attributeName="transform" type="rotate" from="${previousHeadingDeg} 14 24" to="${animatedHeading} 14 24" dur="300ms" fill="freeze"/>`
    : '';
  const initialTransform = Number.isFinite(previousHeadingDeg)
    ? ''
    : ` transform="rotate(${animatedHeading} 14 24)"`;
  return `
    <svg width="${VEHICLE_MARKER_WIDTH_PX}" height="${VEHICLE_MARKER_HEIGHT_PX}" viewBox="0 0 28 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <g data-vehicle-body="true"${initialTransform}>
        ${headingAnimation}
        <image href="${iconUrl}" x="2" y="2" width="24" height="44" preserveAspectRatio="xMidYMid meet" filter="url(#vehicle-shadow)"/>
      </g>
      <defs>
        <filter id="vehicle-shadow" x="-30%" y="-10%" width="160%" height="130%" color-interpolation-filters="sRGB">
          <feDropShadow dx="0" dy="1" stdDeviation=".65" flood-color="#000000" flood-opacity=".55"/>
        </filter>
      </defs>
    </svg>`;
}
