// Google's public "gtx" translate endpoint — the same free, keyless endpoint many
// open-source translation tools rely on. LibreTranslate's public instance (the more
// commonly recommended free/keyless option) now requires an API key, and even when it
// didn't, it has no Cebuano model — this endpoint actually supports Cebuano ('ceb'),
// which is the language that matters most for a Cebu-based marketplace.
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
    // Storage full or unavailable — cache is best-effort only.
  }
}

// Translates a chat message on demand (never automatically) into the given target
// language. Source language is auto-detected so this works regardless of which language
// either party actually typed in. Returns null (never a guess) if the free endpoint is
// unreachable or the response shape is unexpected, so callers can show a clear
// "translation unavailable" state instead of silently displaying garbage.
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
