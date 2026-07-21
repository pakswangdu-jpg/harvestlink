import { CEBU_MUNICIPALITY_COORDS, DEFAULT_MUNICIPALITY } from '../utils/constants.js';

// Real OpenWeatherMap data only — returns null (never a fabricated fallback reading) when
// the API key is missing or the request fails, so callers can distinguish "no data yet"
// from "it's calm and clear."
const CACHE_TTL_MS = 15 * 60 * 1000;
const cache = new Map();

function getCached(key) {
  const entry = cache.get(key);
  if (!entry || Date.now() - entry.cachedAt > CACHE_TTL_MS) return null;
  return entry.data;
}

function setCached(key, data) {
  cache.set(key, { data, cachedAt: Date.now() });
}

// OpenWeatherMap has ~50 granular condition codes (https://openweathermap.org/weather-conditions)
// — `main` is already the short, presentable bucket ("Rain", "Clouds", "Clear", ...).
function simplifyCondition(weatherArray) {
  const entry = weatherArray?.[0];
  if (!entry) return null;
  return { main: entry.main, description: entry.description };
}

// Current conditions + a ~24h-ahead reading from the 5-day/3-hour forecast, for the
// municipality closest to the requested one (falls back to DEFAULT_MUNICIPALITY for any
// name not in the known coordinate table — e.g. "Other").
export async function getWeatherForMunicipality(municipality) {
  const apiKey = process.env.OPENWEATHERMAP_API_KEY;
  if (!apiKey) return null;

  const resolvedMunicipality = CEBU_MUNICIPALITY_COORDS[municipality] ? municipality : DEFAULT_MUNICIPALITY;
  const cached = getCached(resolvedMunicipality);
  if (cached) return cached;

  const { lat, lng } = CEBU_MUNICIPALITY_COORDS[resolvedMunicipality];

  let current;
  let forecastJson = null;
  try {
    const [currentRes, forecastRes] = await Promise.all([
      fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&units=metric&appid=${apiKey}`),
      fetch(`https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lng}&units=metric&appid=${apiKey}&cnt=8`),
    ]);
    if (!currentRes.ok) return null;
    current = await currentRes.json();
    if (forecastRes.ok) forecastJson = await forecastRes.json();
  } catch {
    // Network/DNS failure, OpenWeatherMap outage, etc. — same "no data" contract as a
    // missing key, never a guessed reading.
    return null;
  }

  // Index 7 of the 3-hour-step forecast list is ~24 hours out; falls back to whatever the
  // furthest available step is if fewer were returned.
  const forecastEntry = forecastJson?.list?.[7] || forecastJson?.list?.[(forecastJson?.list?.length || 1) - 1] || null;
  // "pop" (probability of precipitation, 0-1) only exists on the forecast endpoint — current
  // conditions have no "chance of rain" concept, only whether it's raining right now.
  const rainfallProbability = forecastEntry?.pop != null ? Math.round(forecastEntry.pop * 100) : null;

  const result = {
    municipality: resolvedMunicipality,
    currentTemp: Math.round(current.main.temp),
    forecastTemp: forecastEntry ? Math.round(forecastEntry.main.temp) : null,
    humidity: current.main.humidity,
    windSpeedKmh: Math.round((current.wind?.speed || 0) * 3.6),
    rainfallProbability,
    condition: simplifyCondition(current.weather),
    fetchedAt: new Date().toISOString(),
  };

  setCached(resolvedMunicipality, result);
  return result;
}
