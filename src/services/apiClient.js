import { supabase } from '../lib/supabaseClient';

const API_URL = import.meta.env.VITE_API_URL;

const REQUEST_TIMEOUT_MS = 90000;
const GET_CACHE_TTL_MS = 10000;
const LIVE_GET_CACHE_TTL_MS = 1500;
const GET_CACHE_LIMIT = 100;
const getCache = new Map();
const pendingGets = new Map();
let cacheGeneration = 0;

function getCacheTtl(path) {
  return ['/deliveries', '/messages', '/notifications', '/orders', '/donations', '/profiles?role=', '/profiles/nearby-map'].some((prefix) => path.startsWith(prefix))
    ? LIVE_GET_CACHE_TTL_MS
    : GET_CACHE_TTL_MS;
}

if (!API_URL) {
  throw new Error('VITE_API_URL must be set — see .env.example.');
}

async function request(path, { method = 'GET', body } = {}) {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const isGet = method === 'GET';
  const cacheKey = `${session?.user?.id || 'anonymous'}:${path}`;
  const cached = isGet && path !== '/auth/admin-access' ? getCache.get(cacheKey) : null;
  if (cached && (cached.expiresAt > Date.now() || globalThis.document?.visibilityState === 'hidden')) {
    return cached.value;
  }
  if (cached) getCache.delete(cacheKey);

  if (!isGet) {
    cacheGeneration += 1;
    getCache.clear();
  }

  const requestGeneration = cacheGeneration;
  const pending = isGet ? pendingGets.get(cacheKey) : null;
  if (pending?.generation === requestGeneration) return pending.promise;

  const promise = sendRequest(path, { method, body }, session, cacheKey, requestGeneration);
  if (isGet) pendingGets.set(cacheKey, { generation: requestGeneration, promise });
  try {
    return await promise;
  } finally {
    if (isGet && pendingGets.get(cacheKey)?.promise === promise) pendingGets.delete(cacheKey);
  }
}

async function sendRequest(path, { method, body }, session, cacheKey, requestGeneration) {
  const isGet = method === 'GET';
  const headers = { 'Content-Type': 'application/json' };
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(new DOMException(
    `The HarvestLink server did not respond within ${REQUEST_TIMEOUT_MS / 1000} seconds. Please try again.`,
    'TimeoutError',
  )), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });


    const payload = response.status === 204 ? null : await response.json().catch((error) => {

      if (!response.ok && error instanceof SyntaxError) return null;
      throw error;
    });
    if (!response.ok) {
      const error = new Error(payload?.message || payload?.error || `Request failed with status ${response.status}`);
      error.status = response.status;
      if (payload?.error === 'ADMIN_NETWORK_NOT_ALLOWED') {
        error.code = payload.error;
        cacheGeneration += 1;
        getCache.clear();
        window.dispatchEvent?.(new Event('harvestlink:admin-network-denied'));
      }
      throw error;
    }
    if (isGet && path !== '/auth/admin-access' && requestGeneration === cacheGeneration) {
      if (getCache.size >= GET_CACHE_LIMIT) getCache.delete(getCache.keys().next().value);
      getCache.set(cacheKey, { value: payload, expiresAt: Date.now() + getCacheTtl(path) });
    }
    return payload;
  } catch (error) {

    if (error.name === 'AbortError' && controller.signal.aborted) throw controller.signal.reason;
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}




export const apiClient = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  delete: (path) => request(path, { method: 'DELETE' }),
};
