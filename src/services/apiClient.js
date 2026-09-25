import { supabase } from '../lib/supabaseClient';

const API_URL = import.meta.env.VITE_API_URL;
// Render's free service can take about a minute to start before processing a request.
const REQUEST_TIMEOUT_MS = 90000;

if (!API_URL) {
  throw new Error('VITE_API_URL must be set — see .env.example.');
}

async function request(path, { method = 'GET', body } = {}) {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
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

    // 204 No Content has no body to parse.
    const payload = response.status === 204 ? null : await response.json().catch((error) => {
      // A proxy may return an HTML error page; preserve its HTTP status below.
      if (!response.ok && error instanceof SyntaxError) return null;
      throw error;
    });
    if (!response.ok) {
      const error = new Error(payload?.error || `Request failed with status ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return payload;
  } catch (error) {
    // Body reads can report AbortError even when our timer supplied a TimeoutError.
    if (error.name === 'AbortError' && controller.signal.aborted) throw controller.signal.reason;
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

// Matches the `try { ... } catch (error) { setErrors({ form: error.message }) }` pattern
// already used throughout the app's components, so consuming code needs no changes to how
// it handles failures — only to await the now-async call.
export const apiClient = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  delete: (path) => request(path, { method: 'DELETE' }),
};
