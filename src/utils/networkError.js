export function getConnectionErrorMessage(error) {
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const unavailable = error?.code === 'API_UNREACHABLE'
    || /Unable to connect|Failed to fetch|NetworkError|did not respond|timeout|fetch|connection/i.test(error?.message || '');

    return offline || unavailable
    ? 'Please check your connection and try again.'
    : error?.message || 'Please check your connection and try again.';
}
