import { useEffect, useRef, useState } from 'react';
import { Maximize, Minimize } from 'lucide-react';
import { loadGoogleMaps } from '../../lib/googleMapsLoader';
import { getMunicipalityCoords } from '../../utils/constants';
import { haversineKm, resolveRoutePoints } from '../../utils/geo';
import { useMapCoordinates } from '../../hooks/useMapCoordinates';
import { distanceToPolylineKm, fetchRoadRoute, pointAlongRoute } from '../../services/routingService';

const CEBU_CENTER = { lat: 10.3157, lng: 123.8854 };

// Google-Maps-navigation blue — used for every route line (replaces the old always-dashed-
// orange preview line, which couldn't visually distinguish a real live-navigation route from
// a time-estimated one).
const ROUTE_LINE_COLOR = '#1a73e8';

// Live-navigation reroute tuning: the driver's device pings roughly every 8s while sharing
// is on (see useFarmerActiveDeliverySharing.js), but OSRM's public routing server is a shared,
// free, no-key instance — refetching on every single ping would hammer it. So a fresh route
// is only requested when either (a) it's been a while and the driver has actually moved, or
// (b) the driver has genuinely strayed off the last-fetched line, similar to how a real nav
// app only reroutes on an actual missed turn, not on every GPS tick.
const LIVE_REROUTE_MIN_INTERVAL_MS = 20000;
const LIVE_REROUTE_MIN_MOVE_KM = 0.05;
const LIVE_REROUTE_DEVIATION_KM = 0.08;
const LIVE_REROUTE_DEVIATION_COOLDOWN_MS = 8000;
const MARKER_ANIMATION_DURATION_MS = 1500;

const PRECISION_LABELS = {
  address: 'Exact registered address',
  municipality: 'Approximate — municipality center',
  fallback: 'Approximate — municipality area',
};

// Same teardrop pin as FarmerMap.jsx — see that file for why `alert` is a static ring
// rather than a CSS pulse (a data-URI <img> icon can't run a CSS animation).
const PIN_PATH = 'M12 0C5.373 0 0 5.373 0 12c0 9 12 20 12 20s12-11 12-20C24 5.373 18.627 0 12 0z';

function buildPinIcon(mapsApi, color, { alert = false } = {}) {
  const alertRing = alert
    ? `<circle cx="12" cy="12" r="9" fill="none" stroke="${color}" stroke-width="2.5" opacity="0.45"/>`
    : '';
  const svg =
    `<svg width="28" height="38" viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg">` +
    `${alertRing}<path d="${PIN_PATH}" fill="${color}"/><circle cx="12" cy="12" r="5.5" fill="white"/>` +
    `</svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new mapsApi.Size(28, 38),
    anchor: new mapsApi.Point(14, 38),
  };
}

function buildTruckIcon(mapsApi) {
  const svg =
    `<svg width="26" height="26" viewBox="0 0 26 26" xmlns="http://www.w3.org/2000/svg">` +
    `<text x="13" y="21" font-size="22" text-anchor="middle">🚚</text>` +
    `</svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new mapsApi.Size(26, 26),
    anchor: new mapsApi.Point(13, 13),
  };
}

function pointKey(point) {
  return `${point.lat.toFixed(4)},${point.lng.toFixed(4)}`;
}

// Tweens a persisted marker smoothly to its new position instead of snapping — Google Maps
// markers have no built-in "animate to" affordance, so this hand-interpolates position
// across requestAnimationFrame ticks. Cancels any animation already in flight for this
// marker first, so a fast run of updates (e.g. two realtime pings arriving close together)
// doesn't fight itself.
function animateMarkerTo(entry, targetPosition, durationMs = MARKER_ANIMATION_DURATION_MS) {
  if (entry.animationFrameId != null) cancelAnimationFrame(entry.animationFrameId);

  const startPosition = entry.marker.getPosition();
  const start = { lat: startPosition.lat(), lng: startPosition.lng() };
  if (Math.abs(start.lat - targetPosition.lat) < 1e-7 && Math.abs(start.lng - targetPosition.lng) < 1e-7) return;

  const startTime = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - startTime) / durationMs);
    entry.marker.setPosition({
      lat: start.lat + (targetPosition.lat - start.lat) * t,
      lng: start.lng + (targetPosition.lng - start.lng) * t,
    });
    entry.animationFrameId = t < 1 ? requestAnimationFrame(step) : null;
  };
  entry.animationFrameId = requestAnimationFrame(step);
}

// `routes`: [{ id, originLabel, destinationLabel, originMunicipality, destinationMunicipality,
//   deliveryMethod, progress, label, href, etaMinutes, currentPosition, remainingKm }] —
//   `currentPosition`/`remainingKm` come from getLiveTransitProgress and are only non-null
//   once the farmer has a fresh GPS fix (see useFarmerActiveDeliverySharing.js); otherwise the truck
//   position/ETA fall back to the time-estimated simulation, same as before.
// `farmers`: optional [{ id, name, farmName, municipality }] — DTI-verified farmers plotted
// as a reference layer alongside the live delivery routes (e.g. on the buyer dashboard).
// `buyers`: optional [{ id, name, municipality }] — registered buyers plotted the same way
// (e.g. on the farmer dashboard, so a farmer can see who's nearby).
// `stakeholders`: optional [{ id, name, organizationName, municipality }] — registered
// partner organizations plotted the same way (e.g. on the stakeholder dashboard).
// `alertStyle`: when true, the farmer/buyer/stakeholder reference pins (not the route pins)
// get the alert-ring treatment, the same one used for surplus-donation pins on the farmer map.
// `viewerMunicipality`: the signed-in account's own municipality — folded into the camera
// framing below so an idle dashboard (no active deliveries yet) still opens centered on the
// viewer's own area with nearby accounts in view, instead of a generic whole-Cebu view.
export default function DeliveryMap({
  routes,
  farmers = [],
  buyers = [],
  stakeholders = [],
  alertStyle = false,
  viewerMunicipality = null,
}) {
  const wrapperRef = useRef(null);
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const mapsApiRef = useRef(null);
  const routeLayerRef = useRef([]);
  const farmerMarkersRef = useRef([]);
  const buyerMarkersRef = useRef([]);
  const stakeholderMarkersRef = useRef([]);
  const fittedSignatureRef = useRef(null);
  const requestedRouteKeysRef = useRef(new Set());
  // Truck markers are persisted (not recreated every render, unlike every other marker here)
  // so their position can be smoothly animated between updates instead of snapping — keyed
  // by route id: { [routeId]: { marker, infoWindow, infoHtml, animationFrameId } }.
  const truckMarkersRef = useRef({});
  // Bookkeeping for the live-navigation reroute effect (throttle + deviation detection) —
  // a ref, not state, so reading the latest value inside that effect doesn't need it in the
  // dependency array (same pattern as requestedRouteKeysRef above).
  const liveRouteMetaRef = useRef({});
  const pendingLiveFetchRef = useRef(new Set());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [roadGeometries, setRoadGeometries] = useState({});
  const [liveRouteGeometries, setLiveRouteGeometries] = useState({});
  const farmerCoordsById = useMapCoordinates(farmers);
  const buyerCoordsById = useMapCoordinates(buyers);
  const stakeholderCoordsById = useMapCoordinates(stakeholders);

  // Cancels any in-flight marker animation on unmount — otherwise a rAF loop could keep
  // calling setPosition on a marker whose map context is already gone. Deliberately reads
  // truckMarkersRef.current at unmount time (not a snapshot from mount time) — entries are
  // created/destroyed throughout the component's life, so the mount-time value would almost
  // always be stale by the time this actually runs.
  useEffect(() => {
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      Object.values(truckMarkersRef.current).forEach((entry) => {
        if (entry.animationFrameId != null) cancelAnimationFrame(entry.animationFrameId);
      });
    };
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(document.fullscreenElement === wrapperRef.current);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      wrapperRef.current?.requestFullscreen();
    }
  };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined;
    let cancelled = false;

    loadGoogleMaps().then((mapsApi) => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      const map = new mapsApi.Map(containerRef.current, {
        center: CEBU_CENTER,
        zoom: 10,
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: 'greedy',
        clickableIcons: false,
      });
      mapRef.current = map;
      mapsApiRef.current = mapsApi;
      setMapReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // The container's real size is only final after the CSS grid layout settles, which can
  // happen after Google's own initial measurement (and again on the fullscreen toggle) —
  // without re-triggering 'resize' and restoring the center, panning/zooming can look
  // subtly broken or the map can appear blank until manually nudged.
  useEffect(() => {
    if (!mapReady || !containerRef.current) return undefined;
    const map = mapRef.current;
    const mapsApi = mapsApiRef.current;
    const resizeObserver = new ResizeObserver(() => {
      const center = map.getCenter();
      mapsApi.event.trigger(map, 'resize');
      if (center) map.setCenter(center);
    });
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, [mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    const mapsApi = mapsApiRef.current;
    if (!mapReady || !map || !mapsApi) return;

    farmerMarkersRef.current.forEach((marker) => marker.setMap(null));
    farmerMarkersRef.current = [];
    farmers.forEach((farmer) => {
      const coords = farmerCoordsById[farmer.id];
      if (!coords) return;
      const displayName = farmer.farmName || farmer.name;
      const marker = new mapsApi.Marker({
        position: coords,
        map,
        icon: buildPinIcon(mapsApi, '#b45309', { alert: alertStyle }),
        title: displayName,
      });
      const infoWindow = new mapsApi.InfoWindow({
        content:
          `<strong>${displayName}</strong><br/>${farmer.name}<br/>${farmer.municipality}` +
          `<br/><small>${PRECISION_LABELS[coords.precision] || PRECISION_LABELS.fallback}</small>` +
          `<br/><a href="/marketplace?farmerId=${farmer.id}&farmerName=${encodeURIComponent(displayName)}">View products</a>` +
          `<br/><a href="/messages/direct/${farmer.id}">Contact farmer</a>`,
      });
      marker.addListener('click', () => infoWindow.open({ map, anchor: marker }));
      farmerMarkersRef.current.push(marker);
    });
  }, [mapReady, farmers, farmerCoordsById, alertStyle]);

  useEffect(() => {
    const map = mapRef.current;
    const mapsApi = mapsApiRef.current;
    if (!mapReady || !map || !mapsApi) return;

    buyerMarkersRef.current.forEach((marker) => marker.setMap(null));
    buyerMarkersRef.current = [];
    buyers.forEach((buyer) => {
      const coords = buyerCoordsById[buyer.id];
      if (!coords) return;
      // Purple, not the route-destination blue (#1d4ed8) — a dashboard showing both an
      // active "delivery to you" route AND registered-buyer reference pins at the same time
      // would otherwise render two different things in the same color.
      const marker = new mapsApi.Marker({
        position: coords,
        map,
        icon: buildPinIcon(mapsApi, '#7c3aed', { alert: alertStyle }),
        title: buyer.name,
      });
      const infoWindow = new mapsApi.InfoWindow({
        content:
          `<strong>${buyer.name}</strong><br/>${buyer.municipality}` +
          (buyer.contactNumber ? `<br/>${buyer.contactNumber}` : '') +
          `<br/><small>${PRECISION_LABELS[coords.precision] || PRECISION_LABELS.fallback}</small>` +
          `<br/><a href="/messages/direct/${buyer.id}">Contact buyer</a>`,
      });
      marker.addListener('click', () => infoWindow.open({ map, anchor: marker }));
      buyerMarkersRef.current.push(marker);
    });
  }, [mapReady, buyers, buyerCoordsById, alertStyle]);

  useEffect(() => {
    const map = mapRef.current;
    const mapsApi = mapsApiRef.current;
    if (!mapReady || !map || !mapsApi) return;

    stakeholderMarkersRef.current.forEach((marker) => marker.setMap(null));
    stakeholderMarkersRef.current = [];
    stakeholders.forEach((stakeholder) => {
      const coords = stakeholderCoordsById[stakeholder.id];
      if (!coords) return;
      const displayName = stakeholder.organizationName || stakeholder.name;
      const marker = new mapsApi.Marker({
        position: coords,
        map,
        icon: buildPinIcon(mapsApi, '#db2777', { alert: alertStyle }),
        title: displayName,
      });
      const infoWindow = new mapsApi.InfoWindow({
        content:
          `<strong>${displayName}</strong><br/>` +
          (stakeholder.contactPerson ? `${stakeholder.contactPerson}<br/>` : '') +
          `${stakeholder.municipality}` +
          (stakeholder.contactNumber ? `<br/>${stakeholder.contactNumber}` : '') +
          `<br/><small>${PRECISION_LABELS[coords.precision] || PRECISION_LABELS.fallback}</small>` +
          `<br/><a href="/messages/direct/${stakeholder.id}">Contact stakeholder</a>`,
      });
      marker.addListener('click', () => infoWindow.open({ map, anchor: marker }));
      stakeholderMarkersRef.current.push(marker);
    });
  }, [mapReady, stakeholders, stakeholderCoordsById, alertStyle]);

  // Fetches the actual road path for each distinct origin/destination pair once, so the
  // route line follows real streets/bridges instead of cutting a straight line across
  // whatever's in between (open water, in Cebu's case). Tracked in a ref (not state) so a
  // pair already resolved successfully is never re-fetched on every 4s poll while its order
  // is active. A *failed* attempt (network blip, timeout, transient rate limit) is deleted
  // from that ref instead of sticking forever, so the next poll retries it rather than
  // permanently locking the route onto the straight-line fallback for the rest of the session.
  useEffect(() => {
    routes.forEach((route) => {
      const { origin, destination } = resolveRoutePoints(route);

      const key = `${pointKey(origin)}|${pointKey(destination)}`;
      if (requestedRouteKeysRef.current.has(key)) return;
      requestedRouteKeysRef.current.add(key);

      fetchRoadRoute(origin, destination).then((result) => {
        if (!result) {
          requestedRouteKeysRef.current.delete(key);
          return;
        }
        setRoadGeometries((previous) => ({ ...previous, [key]: result.points }));
      });
    });
  }, [routes]);

  // Once a route has a live GPS fix (route.currentPosition — see useFarmerActiveDeliverySharing.js),
  // this recalculates the road route from THAT position to the destination instead of the
  // original origin, so the blue line always shows the actual remaining path, exactly like
  // turn-by-turn navigation. Throttled and deviation-gated (see the LIVE_REROUTE_* constants
  // above) rather than refetched on every position tick, since OSRM's public server can't
  // absorb that load from a single app.
  useEffect(() => {
    routes.forEach((route) => {
      if (!route.currentPosition) return;
      const { destination, isPickup } = resolveRoutePoints(route);
      if (isPickup) return;

      const meta = liveRouteMetaRef.current[route.id];
      const now = Date.now();

      if (meta) {
        const elapsed = now - meta.fetchedAt;
        const movedKm = haversineKm(meta.fetchedFrom, route.currentPosition);
        const deviationKm = distanceToPolylineKm(route.currentPosition, meta.points);
        const dueForRoutineRefresh = elapsed > LIVE_REROUTE_MIN_INTERVAL_MS && movedKm > LIVE_REROUTE_MIN_MOVE_KM;
        const dueForDeviationReroute = deviationKm > LIVE_REROUTE_DEVIATION_KM && elapsed > LIVE_REROUTE_DEVIATION_COOLDOWN_MS;
        if (!dueForRoutineRefresh && !dueForDeviationReroute) return;
      }

      if (pendingLiveFetchRef.current.has(route.id)) return;
      pendingLiveFetchRef.current.add(route.id);

      fetchRoadRoute(route.currentPosition, destination, { skipCache: true }).then((result) => {
        pendingLiveFetchRef.current.delete(route.id);
        if (!result) return;
        liveRouteMetaRef.current = {
          ...liveRouteMetaRef.current,
          [route.id]: { fetchedAt: Date.now(), fetchedFrom: route.currentPosition, points: result.points },
        };
        setLiveRouteGeometries((previous) => ({
          ...previous,
          [route.id]: { points: result.points, distanceKm: result.distanceKm, durationMinutes: result.durationMinutes },
        }));
      });
    });
  }, [routes]);

  useEffect(() => {
    const map = mapRef.current;
    const mapsApi = mapsApiRef.current;
    if (!mapReady || !map || !mapsApi) return;

    routeLayerRef.current.forEach((layer) => layer.setMap(null));
    routeLayerRef.current = [];
    const allPoints = [];
    const truckRouteIdsThisRender = new Set();

    routes.forEach((route) => {
      const { origin, destination, isPickup } = resolveRoutePoints(route);

      const originMarker = new mapsApi.Marker({ position: origin, map, icon: buildPinIcon(mapsApi, '#15803d'), title: route.originLabel });
      routeLayerRef.current.push(originMarker);
      allPoints.push(origin);

      const destinationMarker = new mapsApi.Marker({ position: destination, map, icon: buildPinIcon(mapsApi, '#1d4ed8'), title: route.destinationLabel });
      routeLayerRef.current.push(destinationMarker);
      allPoints.push(destination);
      if (route.currentPosition) allPoints.push(route.currentPosition);

      // Once there's a live GPS fix, the blue line shows the actual REMAINING route (current
      // position -> destination, recalculated as the driver moves — see the effect above),
      // not the original origin -> destination trip. Falls back to a straight line only
      // until the first live route resolves, or until the routing service is unreachable —
      // never blocks rendering on the fetch.
      const isLiveNavigating = Boolean(route.currentPosition) && !isPickup;
      const liveRoute = isLiveNavigating ? liveRouteGeometries[route.id] : null;
      const staticRoadPoints = roadGeometries[`${pointKey(origin)}|${pointKey(destination)}`];
      const pathPoints = liveRoute?.points?.length > 1
        ? liveRoute.points
        : isLiveNavigating
          ? [route.currentPosition, destination]
          : (staticRoadPoints?.length > 1 ? staticRoadPoints : [origin, destination]);

      // A white casing drawn underneath keeps the route line readable against any tile
      // color (dense street yellows/oranges, green cover, blue water) instead of blending
      // into whatever's directly beneath it.
      const casing = new mapsApi.Polyline({ path: pathPoints, strokeColor: '#ffffff', strokeWeight: 8, strokeOpacity: 0.9, map });
      routeLayerRef.current.push(casing);
      const routeLine = new mapsApi.Polyline({ path: pathPoints, strokeColor: ROUTE_LINE_COLOR, strokeWeight: 5, strokeOpacity: 0.95, map });
      routeLayerRef.current.push(routeLine);

      // Pickup orders have no truck to track — the buyer travels there on their own
      // schedule, so the route just shows how to get there, not a live position/ETA.
      if (isPickup) return;

      // A fresh GPS fix from the farmer's own device (see useFarmerActiveDeliverySharing.js) always
      // wins over the walked-along-the-route estimate — it's the real position, not a guess.
      const truckPosition = route.currentPosition || pointAlongRoute(pathPoints, route.progress);
      if (!truckPosition) return;
      truckRouteIdsThisRender.add(route.id);

      const popupText = route.label || `${route.originLabel} → ${route.destinationLabel}`;
      const etaText = route.etaMinutes != null ? `<br/><small>ETA ~${route.etaMinutes} min${route.etaMinutes === 1 ? '' : 's'}</small>` : '';
      const distanceText = route.remainingKm != null ? `<br/><small>${route.remainingKm.toFixed(1)} km remaining</small>` : '';
      const positionSourceText = `<br/><small>${route.currentPosition ? '📍 Live GPS location' : 'Estimated position'}</small>`;
      const infoHtml = (route.href ? `<a href="${route.href}">${popupText}</a>` : popupText) + etaText + distanceText + positionSourceText;

      // Truck markers are persisted across renders (not recreated, unlike every other marker
      // here) so their move to a new position can be smoothly animated instead of snapping.
      // The click listener is registered once at creation and reads `entry.infoHtml` live —
      // re-registering it every render (like the other markers do) would stack a new
      // listener on top of the old one every single time, firing the popup N times per click.
      let entry = truckMarkersRef.current[route.id];
      if (!entry) {
        const marker = new mapsApi.Marker({ position: truckPosition, map, icon: buildTruckIcon(mapsApi) });
        const infoWindow = new mapsApi.InfoWindow();
        entry = { marker, infoWindow, infoHtml, animationFrameId: null };
        marker.addListener('click', () => {
          infoWindow.setContent(entry.infoHtml);
          infoWindow.open({ map, anchor: marker });
        });
        truckMarkersRef.current[route.id] = entry;
      } else {
        entry.marker.setMap(map);
        entry.infoHtml = infoHtml;
        animateMarkerTo(entry, truckPosition);
      }
    });

    // Drop truck markers for any order no longer being tracked (delivered, cancelled, or the
    // buyer navigated away) — these are persisted across renders, so nothing else removes them.
    Object.keys(truckMarkersRef.current).forEach((routeId) => {
      if (truckRouteIdsThisRender.has(routeId)) return;
      const entry = truckMarkersRef.current[routeId];
      if (entry.animationFrameId != null) cancelAnimationFrame(entry.animationFrameId);
      entry.marker.setMap(null);
      delete truckMarkersRef.current[routeId];
    });

    // Reference pins (and the viewer's own municipality) are part of the "what's around me"
    // view too — without this, a dashboard with zero active deliveries fell back to a
    // generic, unfocused whole-Cebu view instead of framing the viewer's own area and the
    // nearby accounts actually being shown.
    Object.values(farmerCoordsById).forEach((coords) => allPoints.push(coords));
    Object.values(buyerCoordsById).forEach((coords) => allPoints.push(coords));
    Object.values(stakeholderCoordsById).forEach((coords) => allPoints.push(coords));
    if (viewerMunicipality) allPoints.push(getMunicipalityCoords(viewerMunicipality));

    // Live polling rebuilds `routes` every few seconds even when nothing but a truck's
    // progress ticked forward — only reset the camera when the actual set of tracked
    // orders/reference pins changes, so recentering never overrides a pan/zoom the user
    // just made.
    const signature = [
      routes.map((route) => route.id).sort().join(','),
      farmers.map((farmer) => farmer.id).sort().join(','),
      buyers.map((buyer) => buyer.id).sort().join(','),
      stakeholders.map((stakeholder) => stakeholder.id).sort().join(','),
      viewerMunicipality || '',
    ].join('|');
    if (signature === fittedSignatureRef.current) return;
    fittedSignatureRef.current = signature;

    if (allPoints.length === 1) {
      map.setCenter(allPoints[0]);
      map.setZoom(13);
    } else if (allPoints.length > 1) {
      const bounds = new mapsApi.LatLngBounds();
      allPoints.forEach((point) => bounds.extend(point));
      map.fitBounds(bounds, 36);
    } else {
      map.setCenter(viewerMunicipality ? getMunicipalityCoords(viewerMunicipality) : CEBU_CENTER);
      map.setZoom(10);
    }
  }, [
    mapReady,
    routes,
    roadGeometries,
    liveRouteGeometries,
    farmers,
    buyers,
    stakeholders,
    farmerCoordsById,
    buyerCoordsById,
    stakeholderCoordsById,
    viewerMunicipality,
  ]);

  return (
    <div ref={wrapperRef} className={`delivery-map-wrapper ${isFullscreen ? 'fullscreen' : ''}`}>
      <button
        type="button"
        className="map-fullscreen-toggle"
        onClick={toggleFullscreen}
        aria-label={isFullscreen ? 'Exit full view' : 'View map fully'}
        title={isFullscreen ? 'Exit full view' : 'View map fully'}
      >
        {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
      </button>
      <div ref={containerRef} className="delivery-map" />
    </div>
  );
}
