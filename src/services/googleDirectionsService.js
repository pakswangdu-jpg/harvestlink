import { loadGoogleGeometry, loadGoogleRoutes } from '../lib/googleMapsLoader';

const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
const ROUTES_API_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const ROUTES_API_FIELD_MASK = [
  'routes.duration', 'routes.staticDuration', 'routes.distanceMeters',
  'routes.description', 'routes.polyline.encodedPolyline',
].join(',');
const TIMEOUT_MS = 12000;

function toWaypoint({ lat, lng }) {
  return { location: { latLng: { latitude: lat, longitude: lng } } };
}

function validPoint(point) {
  return point && Number.isFinite(point.lat) && Number.isFinite(point.lng)
    && Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180;
}

function normalizeRoute(points, distanceMeters, seconds, staticSeconds, hasTrafficData, description) {
  if (points.length < 2 || !points.every(validPoint) || !Number.isFinite(distanceMeters) || distanceMeters < 0
    || !Number.isFinite(seconds) || seconds < 0) return null;
  return {
    points, distanceKm: distanceMeters / 1000, durationMinutes: seconds / 60,
    staticDurationMinutes: Number.isFinite(staticSeconds) ? staticSeconds / 60 : null,
    hasTrafficData, description: description || 'Google Maps route',
  };
}

function routeResult(routes) {
  const valid = routes.filter(Boolean);
  return valid.length ? { ...valid[0], alternatives: valid.slice(1), alternativeRoutes: valid.slice(1).map((route) => route.points) } : null;
}

function withTimeout(promise) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Google routing timed out.')), TIMEOUT_MS);
  })]).finally(() => clearTimeout(timer));
}

let directionsServicePromise = null;
function getDirectionsService() {
  if (!directionsServicePromise) {
    directionsServicePromise = loadGoogleRoutes().then((library) => new library.DirectionsService()).catch((error) => {
      directionsServicePromise = null;
      throw error;
    });
  }
  return directionsServicePromise;
}

// Existing Maps JavaScript Directions service, for projects without Routes API access.
export async function fetchGoogleRoute(origin, destination) {
  if (!validPoint(origin) || !validPoint(destination)) return null;
  try {
    const service = await withTimeout(getDirectionsService());
    const request = { origin, destination, travelMode: 'DRIVING', provideRouteAlternatives: true };
    let result;
    try {
      result = await withTimeout(service.route({ ...request,
        drivingOptions: { departureTime: new Date(), trafficModel: 'bestguess' },
      }));
    } catch {
      // Basic road directions still work when traffic-aware directions are unavailable.
      result = await withTimeout(service.route(request));
    }
    return routeResult((result?.routes || []).map((route) => {
      const leg = route.legs?.[0];
      if (!leg) return null;
      const detailedPath = (leg.steps || []).flatMap((step) => step.path || []);
      const points = (detailedPath.length > 1 ? detailedPath : route.overview_path || [])
        .map((point) => ({ lat: point.lat(), lng: point.lng() }));
      return normalizeRoute(points, leg.distance?.value, leg.duration_in_traffic?.value ?? leg.duration?.value,
        leg.duration?.value, Number.isFinite(leg.duration_in_traffic?.value), route.summary);
    }));
  } catch {
    return null;
  }
}

// TrafficLayer owns road traffic visualization; these are Google's route geometry and durations.
export async function fetchNavigationRoute(origin, destination) {
  if (!validPoint(origin) || !validPoint(destination)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${ROUTES_API_URL}?key=${apiKey}`, {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'X-Goog-FieldMask': ROUTES_API_FIELD_MASK },
      body: JSON.stringify({
        origin: toWaypoint(origin), destination: toWaypoint(destination),
        travelMode: 'DRIVE', routingPreference: 'TRAFFIC_AWARE',
        departureTime: new Date().toISOString(), computeAlternativeRoutes: true,
        polylineQuality: 'HIGH_QUALITY',
      }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const geometry = await withTimeout(loadGoogleGeometry());
    return routeResult((data.routes || []).map((route) => {
      if (!route.polyline?.encodedPolyline) return null;
      const points = geometry.encoding.decodePath(route.polyline.encodedPolyline)
        .map((point) => ({ lat: point.lat(), lng: point.lng() }));
      return normalizeRoute(points, route.distanceMeters, Number.parseFloat(route.duration),
        Number.parseFloat(route.staticDuration), true, route.description);
    }));
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchTrafficRoutes(origin, destination) {
  const result = await fetchNavigationRoute(origin, destination) || await fetchGoogleRoute(origin, destination);
  if (!result) return null;
  const { alternatives = [], alternativeRoutes, ...primary } = result;
  void alternativeRoutes;
  return [primary, ...alternatives];
}
