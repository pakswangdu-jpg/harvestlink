




const TRANSLATE_URL = 'https://translate.googleapis.com/translate_a/single';
const CACHE_PREFIX = 'harvestlink_translate_v1_';
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 6000;

export const MESSAGE_TRANSLATION_LANGUAGES = [
  { value: 'ceb', label: 'Cebuano (Bisaya)' },
  { value: 'tl', label: 'Filipino (Tagalog)' },
  { value: 'en', label: 'English' },
];

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






export async function translateText(text, targetLang) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;

  const cacheKey = `${CACHE_PREFIX}${targetLang}__${trimmed}`;
  const cached = readCache(cacheKey);
  if (cached) return cached;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const url = `${TRANSLATE_URL}?${new URLSearchParams({
      client: 'gtx',
      sl: 'auto',
      tl: targetLang,
      dt: 't',
      q: trimmed,
    }).toString()}`;
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;

    const data = await response.json();
    const segments = data?.[0];
    if (!Array.isArray(segments)) return null;

    const translated = segments.map((segment) => segment?.[0] || '').join('');
    if (!translated) return null;

    const result = { translated, detectedSourceLang: data?.[2] || null };
    writeCache(cacheKey, result);
    return result;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}
