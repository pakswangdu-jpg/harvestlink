// Browser permission only: coordinates from this check are never saved or shared.
export function requireDeliveryLocation(browserNavigator = navigator, secureContext = window.isSecureContext !== false) {
  return new Promise((resolve, reject) => {
    if (!secureContext) {
      reject(new Error('Location requires a secure connection. Open HarvestLink over HTTPS and try again.'));
      return;
    }
    if (!browserNavigator?.geolocation) {
      reject(new Error('This browser does not support location. Use a browser with location access to start delivery.'));
      return;
    }
    browserNavigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (!Number.isFinite(coords?.latitude) || !Number.isFinite(coords?.longitude)
          || Math.abs(coords.latitude) > 90 || Math.abs(coords.longitude) > 180) {
          reject(new Error('Your location is unavailable. Turn on device Location Services and try again.'));
          return;
        }
        resolve();
      },
      (error) => reject(new Error(error.code === 1
        ? 'Allow location in your browser site settings, then try Start delivery again.'
        : error.code === 3
          ? 'Location timed out. Turn on device Location Services and try again.'
          : 'Your location is unavailable. Turn on device Location Services and try again.')),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
  });
}

export function createLocationPermissionController({ browserNavigator, secureContext = true, onChange }) {
  let state = { permission: 'checking', requesting: false, error: '' };
  let stopped = false;
  let permissionStatus = null;
  let queryId = 0;
  const publish = (patch) => {
    if (stopped) return;
    state = { ...state, ...patch };
    onChange(state);
  };
  const handleChange = () => publish({ permission: permissionStatus.state, error: '' });
  const unavailable = () => {
    if (!secureContext) { publish({ permission: 'insecure', requesting: false }); return true; }
    if (!browserNavigator?.geolocation) { publish({ permission: 'unsupported', requesting: false }); return true; }
    return false;
  };

  async function refresh() {
    if (stopped || unavailable()) return;
    const id = ++queryId;
    try {
      const next = await browserNavigator.permissions?.query({ name: 'geolocation' });
      if (stopped || id !== queryId) return;
      if (next) {
        permissionStatus?.removeEventListener('change', handleChange);
        permissionStatus = next;
        permissionStatus.addEventListener('change', handleChange);
        publish({ permission: next.state });
      } else if (state.permission === 'checking') publish({ permission: 'prompt' });
    } catch {
      // Some browsers expose geolocation but cannot query its permission.
      if (!stopped && id === queryId && state.permission === 'checking') publish({ permission: 'prompt' });
    }
  }

  function request() {
    if (stopped || state.requesting || unavailable()) return;
    publish({ requesting: true, error: '' });
    try {
      browserNavigator.geolocation.getCurrentPosition(
        () => {
          queryId += 1;
          publish({ permission: 'granted', requesting: false, error: '' });
        },
        (error) => {
          queryId += 1;
          publish({
            permission: error.code === 1 ? 'denied' : state.permission === 'checking' ? 'prompt' : state.permission,
            requesting: false,
            error: error.code === 1 ? '' : error.code === 3
              ? 'Location timed out. Turn on device Location Services, move somewhere with a clearer signal, and try again.'
              : 'Your location is unavailable. Check device Location Services and try again.',
          });
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
      );
    } catch {
      publish({ requesting: false, error: 'Could not request location. Check your browser site permissions and try again.' });
    }
  }

  return {
    refresh,
    request,
    destroy() {
      stopped = true;
      queryId += 1;
      permissionStatus?.removeEventListener('change', handleChange);
    },
  };
}
