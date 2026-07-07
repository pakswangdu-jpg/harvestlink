import { haversineKm } from '../utils/geo';

const OSRM_URL = 'https://router.project-osrm.org/route/v1/driving';
// Bumped whenever the cached value's shape changes, so a stale entry written under the old
// shape (e.g. a bare points array, before distance/duration were added) is never read back
// and silently misinterpreted under the new shape — same reasoning as geocodeService's key.
const CACHE_PREFIX = 'harvestlink_route_v2_';
// Road geometry between two fixed municipality centers never changes, so this can be
// cached aggressively — same reasoning as geocodeService's address cache.
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
    // Storage full or unavailable — cache is best-effort only.
  }
}

function buildCacheKey(origin, destination) {
  return `${CACHE_PREFIX}${origin.lat.toFixed(4)}_${origin.lng.toFixed(4)}__${destination.lat.toFixed(4)}_${destination.lng.toFixed(4)}`;
}

// Fetches the actual road-following path between two points from OSRM's public routing
// server (same free/no-key OSM ecosystem as the map tiles and Nominatim geocoding already
// used elsewhere) — so a delivery route between, say, Mandaue and Lapu-Lapu draws along
// the real bridge instead of a straight line cutting across the strait, and its ETA is
// OSRM's actual driving-time estimate instead of a straight-line-distance guess. Returns
// null (never a guess) if the routing service is unavailable, so callers can fall back to
// a straight line rather than block or fabricate a fake path.
export async function fetchRoadRoute(origin, destination) {
  const cacheKey = buildCacheKey(origin, destination);
  const cached = readCache(cacheKey);
  if (cached?.points) return cached;

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
    writeCache(cacheKey, result);
    return result;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Synchronous, cache-only lookup (no network) — used by ETA calculations that run inline
// during render and can't await a fetch. Returns null until fetchRoadRoute has resolved
// for this pair at least once (e.g. from the map component) and populated the cache.
export function getCachedRoadRoute(origin, destination) {
  const cached = readCache(buildCacheKey(origin, destination));
  return cached?.points ? cached : null;
}

// Places a point a given fraction of the way along a multi-point path, walking by actual
// distance travelled rather than by point index — the points from OSRM aren't evenly
// spaced, so indexing by fraction * points.length would make the truck speed up and slow
// down erratically instead of moving at a steady pace along the road.
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
