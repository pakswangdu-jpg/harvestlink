import { CEBU_MUNICIPALITY_COORDS, DEFAULT_MUNICIPALITY } from '../utils/constants.js';




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



function simplifyCondition(weatherArray) {
  const entry = weatherArray?.[0];
  if (!entry) return null;
  return { main: entry.main, description: entry.description };
}




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


    return null;
  }



  const forecastEntry = forecastJson?.list?.[7] || forecastJson?.list?.[(forecastJson?.list?.length || 1) - 1] || null;


  const rainfallProbability = forecastEntry?.pop != null ? Math.round(forecastEntry.pop * 100) : null;

  const result = {
    municipality: resolvedMunicipality,
    currentTemp: Math.round(current.main.temp),
    feelsLike: Math.round(current.main.feels_like),
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
