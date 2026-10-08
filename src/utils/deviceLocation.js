export function getAccurateDeviceLocation(geolocation, { signal, timeout = 20000, targetAccuracy = 50 } = {}) {
  return new Promise((resolve, reject) => {
    let watchId;
    let bestPosition;
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (watchId !== undefined) geolocation.clearWatch(watchId);
      signal?.removeEventListener('abort', abort);
      if (error) reject(error);
      else resolve(bestPosition);
    };
    const abort = () => finish(new DOMException('Location request cancelled.', 'AbortError'));
    const timer = setTimeout(() => {
      finish(bestPosition ? null : { code: 3, message: 'Location timed out.' });
    }, timeout);
    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener('abort', abort, { once: true });
    try {
      watchId = geolocation.watchPosition((position) => {
        if (settled) return;
        const { latitude, longitude, accuracy } = position.coords;
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
          || Math.abs(latitude) > 90 || Math.abs(longitude) > 180
          || !Number.isFinite(accuracy) || accuracy < 0) return;
        if (!bestPosition || accuracy < bestPosition.coords.accuracy) bestPosition = position;
        if (accuracy <= targetAccuracy) finish();
      }, (error) => {
        finish(error.code === 1 || !bestPosition ? error : null);
      }, { enableHighAccuracy: true, timeout, maximumAge: 0 });
      if (settled) geolocation.clearWatch(watchId);
    } catch (error) {
      finish(error);
    }
  });
}
