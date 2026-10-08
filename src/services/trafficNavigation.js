import { haversineKm, validateCoordinates } from '../utils/geo';
import { distanceToPolylineKm } from './routingService';
import { isFreshLivePosition, normalizeLivePosition } from '../utils/liveTrackingPosition';

const MIN_REFRESH_MS = 30000;
const TRAFFIC_REFRESH_MS = 120000;
const RETRY_MS = 30000;

// Match Google's road geometries across refreshes without creating any new route.
export function sameRouteCorridor(previous, candidate) {
  if (!previous?.points?.length || !candidate?.points?.length) return false;
  // Compare only the road ahead of the new origin, not vertices already passed.
  let start = 0;
  let closest = Infinity;
  for (let i = 0; i < previous.points.length - 1; i += 1) {
    const distance = distanceToPolylineKm(candidate.points[0], previous.points.slice(i, i + 2));
    if (distance < closest) { closest = distance; start = i; }
  }
  const remaining = previous.points.slice(start + 1);
  const overlap = (a, b) => {
    const sampled = a.filter((_, i) => i % Math.max(1, Math.floor(a.length / 30)) === 0);
    return sampled.filter((point) => distanceToPolylineKm(point, b) <= 0.02).length / sampled.length;
  };
  return overlap(candidate.points, previous.points.slice(start)) >= 0.9 && overlap(remaining, candidate.points) >= 0.9;
}

export function fasterAlternative(selected, alternatives) {
  if (!selected?.hasTrafficData) return null;
  const faster = alternatives.filter((route) => route.hasTrafficData
    && Number.isFinite(route.durationMinutes) && route.durationMinutes >= 0
    && selected.durationMinutes - route.durationMinutes >= 2
    && route.durationMinutes <= selected.durationMinutes * 0.85)
    .sort((a, b) => a.durationMinutes - b.durationMinutes)[0];
  return faster ? { route: faster, savingsMinutes: Math.floor(selected.durationMinutes - faster.durationMinutes) } : null;
}

export function createTrafficNavigator({ fetchRoutes, onChange, now = Date.now }) {
  let inputs = {};
  let state = { selected: null, alternatives: [], suggestion: null, updating: false, stale: false, message: '' };
  let pending = false;
  let requestId = 0;
  let destroyed = false;
  let lastRequestAt = -Infinity;
  let lastOrigin = null;
  let lastFailure = false;
  let dismissedUntil = 0;
  let contextKey = '';
  let usingLiveOrigin = false;
  const publish = (patch) => { state = { ...state, ...patch }; if (!destroyed) onChange(state); };

  function livePosition() {
    const position = normalizeLivePosition({ ...inputs.position,
      locationUpdatedAt: inputs.position?.locationUpdatedAt ?? inputs.locationUpdatedAt });
    return position && isFreshLivePosition(position, now()) ? position : null;
  }

  async function refresh(preferred = null) {
    if (pending || destroyed || inputs.enabled === false || !inputs.destination) return;
    const live = inputs.active ? livePosition() : null;
    const originSource = inputs.active ? live || (!inputs.position ? inputs.origin : null) : inputs.origin;
    const origin = validateCoordinates(originSource?.lat, originSource?.lng);
    if (!origin) {
      if (inputs.active) publish({ stale: true, suggestion: null, message: 'GPS location is out of date. Showing the last known position.' });
      return;
    }
    const destination = validateCoordinates(inputs.destination.lat, inputs.destination.lng);
    if (!destination) return;
    const previous = state.selected;
    const firstLiveFix = Boolean(live && !usingLiveOrigin);
    const offRoute = previous && inputs.active
      && distanceToPolylineKm(origin, previous.points) > Math.max(0.08, (inputs.position?.accuracy || 0) / 1000);
    const id = ++requestId;
    pending = true;
    lastRequestAt = now();
    lastOrigin = origin;
    usingLiveOrigin = Boolean(live);
    publish({ updating: true, suggestion: null });
    try {
      const routes = await fetchRoutes(origin, destination);
      if (destroyed || id !== requestId) return;
      const latest = inputs.active ? livePosition() : null;
      if (latest && haversineKm(origin, latest) >= 0.15) {
        // A slow Google response must not leave routing anchored at an older GPS fix.
        pending = false;
        void refresh(preferred);
        return;
      }
      if (!routes?.length) {
        lastFailure = true;
        publish({ stale: true, message: previous ? 'Keeping your route. Google route updates are temporarily unavailable.' : 'Google road route unavailable. Retrying shortly.' });
        return;
      }
      lastFailure = false;
      let selected;
      let message = '';
      if (preferred) {
        selected = routes.find((route) => sameRouteCorridor(preferred, route));
        if (!selected) {
          publish({ stale: true, message: 'That alternative is no longer available. Your current route is unchanged.' });
          return;
        }
        message = 'Selected route updated from your current GPS location.';
      } else if (!previous || offRoute || firstLiveFix) {
        selected = routes[0];
        if (offRoute) message = 'Route recalculated from your current GPS location.';
      } else {
        selected = routes.find((route) => sameRouteCorridor(previous, route));
        if (!selected) {
          publish({ stale: true, alternatives: [], message: 'Keeping your selected route. Google did not return an updated ETA for it.' });
          return;
        }
      }
      const alternatives = routes.filter((route) => route !== selected);
      publish({ selected, alternatives, stale: false, message: inputs.active && !live
        ? 'Showing the route from the saved farm location until GPS is available.' : message,
        suggestion: now() >= dismissedUntil ? fasterAlternative(selected, alternatives) : null });
    } catch {
      if (!destroyed && id === requestId) {
        lastFailure = true;
        publish({ stale: true, message: 'Google routing is temporarily unavailable. Retrying shortly.' });
      }
    } finally {
      if (id === requestId) { pending = false; publish({ updating: false }); }
    }
  }

  function tick() {
    if (destroyed || pending || inputs.enabled === false || !inputs.destination) return;
    const live = inputs.active ? livePosition() : null;
    const position = inputs.active ? live || (!inputs.position ? inputs.origin : null) : inputs.origin;
    if (!position) {
      if (inputs.active && !state.stale) publish({ stale: true, suggestion: null, message: 'GPS location is out of date. Showing the last known position.' });
      return;
    }
    const elapsed = now() - lastRequestAt;
    const offRoute = inputs.active && state.selected
      && distanceToPolylineKm(position, state.selected.points) > Math.max(0.08, (inputs.position?.accuracy || 0) / 1000);
    const moved = lastOrigin && haversineKm(lastOrigin, position) >= 0.15;
    if ((live && !usingLiveOrigin) || (!state.selected && elapsed >= RETRY_MS) || (lastFailure && elapsed >= RETRY_MS)
      || (inputs.active && elapsed >= MIN_REFRESH_MS && (offRoute || moved || elapsed >= TRAFFIC_REFRESH_MS || state.stale))) {
      void refresh();
    }
  }

  return {
    update(next) {
      inputs = next;
      // A profile preview must not delay the first GPS route, even if in flight.
      if (pending && next.active && !usingLiveOrigin && livePosition()) {
        requestId += 1;
        pending = false;
      }
      const nextKey = JSON.stringify([next.destination, next.active, next.active ? null : next.origin]);
      if (contextKey !== nextKey) {
        contextKey = nextKey;
        requestId += 1;
        pending = false;
        lastRequestAt = -Infinity;
        usingLiveOrigin = false;
        lastOrigin = null;
        lastFailure = false;
        dismissedUntil = 0;
        publish({ selected: null, alternatives: [], suggestion: null, stale: false, updating: false, message: '' });
      }
      tick();
    },
    tick,
    chooseAlternative() {
      if (!inputs.active || !state.suggestion || pending) return Promise.resolve();
      const preferred = state.suggestion.route;
      dismissedUntil = now() + TRAFFIC_REFRESH_MS;
      return refresh(preferred);
    },
    keepCurrent() {
      dismissedUntil = now() + TRAFFIC_REFRESH_MS;
      publish({ suggestion: null, message: 'Keeping your current route.' });
    },
    destroy() { destroyed = true; requestId += 1; },
  };
}
