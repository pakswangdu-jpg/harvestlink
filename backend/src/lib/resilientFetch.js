const DEFAULT_RETRY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const TRANSIENT_NETWORK_CODES = new Set([
  'ECONNRESET',
  'ETIMEDOUT',
  'ECONNABORTED',
  'EPIPE',
  'EAI_AGAIN',
  'UND_ERR_SOCKET',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
]);

export function getNetworkErrorCode(error) {
  let current = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (typeof current.code === 'string' && current.code) return current.code;
    current = current.cause;
  }
  return '';
}

export function isTransientNetworkError(error) {
  if (!error) return false;
  const code = getNetworkErrorCode(error);
  if (TRANSIENT_NETWORK_CODES.has(code)) return true;
  if (error.name === 'TypeError' && /fetch failed/i.test(error.message || '')) {
    return /ECONNRESET|ETIMEDOUT|ECONNABORTED|EPIPE|EAI_AGAIN|socket|TLS/i.test(
      `${error.cause?.message || ''} ${code}`,
    );
  }
  return false;
}

function getRequestMethod(input, init) {
  if (init?.method) return String(init.method).toUpperCase();
  if (input && typeof input === 'object' && 'method' in input && input.method) {
    return String(input.method).toUpperCase();
  }
  return 'GET';
}

function getRequestPathname(input) {
  const rawUrl = typeof input === 'string'
    ? input
    : (input && typeof input === 'object' && 'url' in input ? String(input.url) : '');
  if (!rawUrl) return '';
  try {
    return new URL(rawUrl, 'http://localhost').pathname;
  } catch {
    return rawUrl;
  }
}

export function createResilientFetch({
  fetchImpl = globalThis.fetch,
  retries = 2,
  retryDelayMs = 200,
  retryMethods = DEFAULT_RETRY_METHODS,
  retryPostPathPatterns = [],
} = {}) {
  return async function resilientFetch(input, init) {
    const method = getRequestMethod(input, init);
    const pathname = getRequestPathname(input);
    const canRetryRequest = retryMethods.has(method)
      || (method === 'POST' && retryPostPathPatterns.some((pattern) => pathname.endsWith(pattern)));
    const signal = init?.signal || (input && typeof input === 'object' && 'signal' in input ? input.signal : undefined);

    for (let attempt = 0; ; attempt += 1) {
      try {
        return await fetchImpl(input, init);
      } catch (error) {
        const shouldRetry = canRetryRequest
          && attempt < retries
          && !signal?.aborted
          && isTransientNetworkError(error);
        if (!shouldRetry) throw error;

        if (retryDelayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs * (attempt + 1)));
        }
      }
    }
  };
}

export const resilientFetch = createResilientFetch();
