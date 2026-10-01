import { haversineKm } from '../utils/geo';

const OSRM_URL = 'https://router.project-osrm.org/route/v1/driving';



const CACHE_PREFIX = 'harvestlink_route_v2_';


const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 6000;

function readCache(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { value, cachedAt } = JSON.parse(raw);
    if (Date.now() - cachedAt > CACHE_TTL_MS) return null;
    return value;
  } catch {
    return null;
  }
}

function writeCache(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify({ value, cachedAt: Date.now() }));
  } catch {

  }
}

function buildCacheKey(origin, destination) {
  return `${CACHE_PREFIX}${origin.lat.toFixed(4)}_${origin.lng.toFixed(4)}__${destination.lat.toFixed(4)}_${destination.lng.toFixed(4)}`;
}













export async function fetchRoadRoute(origin, destination, { skipCache = false } = {}) {
  const cacheKey = buildCacheKey(origin, destination);
  if (!skipCache) {
    const cached = readCache(cacheKey);
    if (cached?.points) return cached;
  }

  const url = `${OSRM_URL}/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;

    const data = await response.json();
    const route = data.routes?.[0];
    const coordinates = route?.geometry?.coordinates;
    if (!coordinates?.length) return null;

    const result = {
      points: coordinates.map(([lng, lat]) => ({ lat, lng })),
      distanceKm: route.distance / 1000,
      durationMinutes: route.duration / 60,
    };
    if (!skipCache) writeCache(cacheKey, result);
    return result;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}




export function getCachedRoadRoute(origin, destination) {
  const cached = readCache(buildCacheKey(origin, destination));
  return cached?.points ? cached : null;
}





export function pointAlongRoute(points, fraction) {
  if (!points || points.length < 2) return points?.[0] || null;
  const clamped = Math.min(1, Math.max(0, fraction));

  const segmentLengths = [];
  let totalLength = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    const length = haversineKm(points[i], points[i + 1]);
    segmentLengths.push(length);
    totalLength += length;
  }
  if (totalLength === 0) return points[0];

  const targetDistance = totalLength * clamped;
  let traveled = 0;
  for (let i = 0; i < segmentLengths.length; i += 1) {
    const segmentLength = segmentLengths[i];
    if (traveled + segmentLength >= targetDistance) {
      const segmentFraction = segmentLength === 0 ? 0 : (targetDistance - traveled) / segmentLength;
      const a = points[i];
      const b = points[i + 1];
      return {
        lat: a.lat + (b.lat - a.lat) * segmentFraction,
        lng: a.lng + (b.lng - a.lng) * segmentFraction,
      };
    }
    traveled += segmentLength;
  }
  return points[points.length - 1];
}




export function distanceToPolylineKm(point, points) {
  if (!points || points.length < 2) return Infinity;
  let minDistance = Infinity;
  for (let i = 0; i < points.length - 1; i += 1) {
    const distance = distanceToSegmentKm(point, points[i], points[i + 1]);
    if (distance < minDistance) minDistance = distance;
  }
  return minDistance;
}







export function nearestIndexOnPath(point, points) {
  if (!points || points.length < 2) return 0;
  let minSegmentDistance = Infinity;
  let nearestIndex = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    const segmentDistance = distanceToSegmentKm(point, points[i], points[i + 1]);
    if (segmentDistance < minSegmentDistance) {
      minSegmentDistance = segmentDistance;
      nearestIndex = haversineKm(point, points[i]) <= haversineKm(point, points[i + 1]) ? i : i + 1;
    }
  }
  return nearestIndex;
}



function distanceToSegmentKm(point, a, b) {
  const abLng = b.lng - a.lng;
  const abLat = b.lat - a.lat;
  const lengthSq = abLng * abLng + abLat * abLat;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((point.lng - a.lng) * abLng + (point.lat - a.lat) * abLat) / lengthSq));
  const closest = { lat: a.lat + abLat * t, lng: a.lng + abLng * t };
  return haversineKm(point, closest);
}
