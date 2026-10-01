





const OSRM_URL = 'https://router.project-osrm.org/route/v1/driving';
const FETCH_TIMEOUT_MS = 6000;




const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const cache = new Map();

function cacheKey(origin, destination) {
  return `${origin.lat.toFixed(4)}_${origin.lng.toFixed(4)}__${destination.lat.toFixed(4)}_${destination.lng.toFixed(4)}`;
}




export async function fetchRoadRoute(origin, destination) {
  const key = cacheKey(origin, destination);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) return cached.value;

  const url = `${OSRM_URL}/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=false`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;

    const data = await response.json();
    const route = data.routes?.[0];
    if (!route) return null;

    const result = { distanceKm: route.distance / 1000, durationMinutes: route.duration / 60 };
    cache.set(key, { value: result, cachedAt: Date.now() });
    return result;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}
