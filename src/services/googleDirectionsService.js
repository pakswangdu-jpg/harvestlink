import { loadGoogleGeometry, loadGoogleRoutes } from '../lib/googleMapsLoader';

const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
const ROUTES_API_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const ROUTES_API_FIELD_MASK = [
  'routes.duration',
  'routes.distanceMeters',
  'routes.polyline.encodedPolyline',
  'routes.travelAdvisory.speedReadingIntervals',
].join(',');
const SPEED_VALUES = new Set(['NORMAL', 'SLOW', 'TRAFFIC_JAM']);

function toWaypoint({ lat, lng }) {
  return { location: { latLng: { latitude: lat, longitude: lng } } };
}












let directionsServicePromise = null;

function getDirectionsService() {
  if (!directionsServicePromise) {
    directionsServicePromise = loadGoogleRoutes().then((routesLib) => new routesLib.DirectionsService());
  }
  return directionsServicePromise;
}





export async function fetchGoogleRoute(origin, destination) {
  try {
    const service = await getDirectionsService();
    const result = await service.route({
      origin,
      destination,
      travelMode: 'DRIVING',
      drivingOptions: { departureTime: new Date(), trafficModel: 'bestguess' },
    });
    const route = result?.routes?.[0];
    const leg = route?.legs?.[0];
    if (!route || !leg) return null;

    const points = (route.overview_path || []).map((point) => ({ lat: point.lat(), lng: point.lng() }));
    if (points.length < 2) return null;

    return {
      points,
      distanceKm: leg.distance.value / 1000,


      durationMinutes: (leg.duration_in_traffic?.value ?? leg.duration.value) / 60,
      hasTrafficData: leg.duration_in_traffic != null,
    };
  } catch {
    return null;
  }
}












export async function fetchNavigationRoute(origin, destination) {
  try {
    const geometryLib = await loadGoogleGeometry();
    const response = await fetch(`${ROUTES_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-FieldMask': ROUTES_API_FIELD_MASK,
      },
      body: JSON.stringify({
        origin: toWaypoint(origin),
        destination: toWaypoint(destination),
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_AWARE',
        computeAlternativeRoutes: true,
        extraComputations: ['TRAFFIC_ON_POLYLINE'],
        polylineQuality: 'HIGH_QUALITY',
      }),
    });
    if (!response.ok) return null;

    const data = await response.json();
    const [primary, ...alternatives] = data?.routes || [];
    if (!primary?.polyline?.encodedPolyline) return null;

    const decode = (encoded) => geometryLib.encoding.decodePath(encoded).map((latLng) => ({ lat: latLng.lat(), lng: latLng.lng() }));
    const points = decode(primary.polyline.encodedPolyline);
    if (points.length < 2) return null;

    const speedIntervals = (primary.travelAdvisory?.speedReadingIntervals || [])
      .map((interval) => ({
        startIndex: interval.startPolylinePointIndex || 0,
        endIndex: interval.endPolylinePointIndex ?? points.length - 1,
        speed: SPEED_VALUES.has(interval.speed) ? interval.speed : 'NORMAL',
      }))
      .filter((interval) => interval.endIndex > interval.startIndex);

    return {
      points,
      distanceKm: primary.distanceMeters / 1000,


      durationMinutes: Number.parseInt(primary.duration, 10) / 60,
      hasTrafficData: speedIntervals.length > 0,
      speedIntervals,
      alternativeRoutes: alternatives
        .map((route) => (route.polyline?.encodedPolyline ? decode(route.polyline.encodedPolyline) : []))
        .filter((path) => path.length > 1),
    };
  } catch {
    return null;
  }
}
