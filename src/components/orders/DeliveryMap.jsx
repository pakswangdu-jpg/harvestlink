import { useEffect, useRef, useState } from 'react';
import { Maximize, Minimize } from 'lucide-react';
import { loadGoogleMaps } from '../../lib/googleMapsLoader';
import { resolveRoutePoints } from '../../utils/geo';
import { useMapCoordinates } from '../../hooks/useMapCoordinates';
import { fetchRoadRoute, pointAlongRoute } from '../../services/routingService';

const CEBU_CENTER = { lat: 10.3157, lng: 123.8854 };

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

// `routes`: [{ id, originLabel, destinationLabel, originMunicipality, destinationMunicipality, deliveryMethod, progress, label, href, etaMinutes }]
// `farmers`: optional [{ id, name, farmName, municipality }] — DTI-verified farmers plotted
// as a reference layer alongside the live delivery routes (e.g. on the buyer dashboard).
// `buyers`: optional [{ id, name, municipality }] — registered buyers plotted the same way
// (e.g. on the farmer dashboard, so a farmer can see who's nearby).
// `alertStyle`: when true, the farmer/buyer reference pins (not the route pins) get the
// alert-ring treatment, the same one used for surplus-donation pins on the farmer map.
export default function DeliveryMap({ routes, farmers = [], buyers = [], alertStyle = false }) {
  const wrapperRef = useRef(null);
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const mapsApiRef = useRef(null);
  const routeLayerRef = useRef([]);
  const farmerMarkersRef = useRef([]);
  const buyerMarkersRef = useRef([]);
  const fittedSignatureRef = useRef(null);
  const requestedRouteKeysRef = useRef(new Set());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [roadGeometries, setRoadGeometries] = useState({});
  const farmerCoordsById = useMapCoordinates(farmers);
  const buyerCoordsById = useMapCoordinates(buyers);

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
          `<br/><a href="/marketplace?farmerId=${farmer.id}&farmerName=${encodeURIComponent(displayName)}">View products</a>`,
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
      const marker = new mapsApi.Marker({
        position: coords,
        map,
        icon: buildPinIcon(mapsApi, '#1d4ed8', { alert: alertStyle }),
        title: buyer.name,
      });
      const infoWindow = new mapsApi.InfoWindow({
        content:
          `<strong>${buyer.name}</strong><br/>${buyer.municipality}` +
          (buyer.contactNumber ? `<br/>${buyer.contactNumber}` : '') +
          `<br/><small>${PRECISION_LABELS[coords.precision] || PRECISION_LABELS.fallback}</small>`,
      });
      marker.addListener('click', () => infoWindow.open({ map, anchor: marker }));
      buyerMarkersRef.current.push(marker);
    });
  }, [mapReady, buyers, buyerCoordsById, alertStyle]);

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

  useEffect(() => {
    const map = mapRef.current;
    const mapsApi = mapsApiRef.current;
    if (!mapReady || !map || !mapsApi) return;

    routeLayerRef.current.forEach((layer) => layer.setMap(null));
    routeLayerRef.current = [];
    const allPoints = [];

    routes.forEach((route) => {
      const { origin, destination, isPickup } = resolveRoutePoints(route);

      const originMarker = new mapsApi.Marker({ position: origin, map, icon: buildPinIcon(mapsApi, '#15803d'), title: route.originLabel });
      routeLayerRef.current.push(originMarker);
      allPoints.push(origin);

      const destinationMarker = new mapsApi.Marker({ position: destination, map, icon: buildPinIcon(mapsApi, '#1d4ed8'), title: route.destinationLabel });
      routeLayerRef.current.push(destinationMarker);
      allPoints.push(destination);

      // Falls back to a straight line only until the real road geometry resolves (or if
      // the routing service is unreachable) — never blocks rendering on the fetch.
      const roadPoints = roadGeometries[`${pointKey(origin)}|${pointKey(destination)}`];
      const pathPoints = roadPoints?.length > 1 ? roadPoints : [origin, destination];

      // A white casing drawn underneath keeps the route line readable against any tile
      // color (dense street yellows/oranges, green cover, blue water) instead of blending
      // into whatever's directly beneath it. Google Polylines don't support a native
      // dash-array — the dashed effect is a repeated line-segment icon along the path.
      const casing = new mapsApi.Polyline({ path: pathPoints, strokeColor: '#ffffff', strokeWeight: 7, strokeOpacity: 0.9, map });
      routeLayerRef.current.push(casing);
      const dashedLine = new mapsApi.Polyline({
        path: pathPoints,
        strokeOpacity: 0,
        icons: [{
          icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, strokeColor: '#ea580c', strokeWeight: 4, scale: 3 },
          offset: '0',
          repeat: '14px',
        }],
        map,
      });
      routeLayerRef.current.push(dashedLine);

      // Pickup orders have no truck to track — the buyer travels there on their own
      // schedule, so the route just shows how to get there, not a live position/ETA.
      if (!isPickup) {
        const truckPosition = pointAlongRoute(pathPoints, route.progress);
        const truckMarker = new mapsApi.Marker({ position: truckPosition, map, icon: buildTruckIcon(mapsApi) });
        const popupText = route.label || `${route.originLabel} → ${route.destinationLabel}`;
        const etaText = route.etaMinutes != null ? `<br/><small>ETA ~${route.etaMinutes} min${route.etaMinutes === 1 ? '' : 's'}</small>` : '';
        const truckInfoWindow = new mapsApi.InfoWindow({
          content: (route.href ? `<a href="${route.href}">${popupText}</a>` : popupText) + etaText,
        });
        truckMarker.addListener('click', () => truckInfoWindow.open({ map, anchor: truckMarker }));
        routeLayerRef.current.push(truckMarker);
      }
    });

    // Live polling rebuilds `routes` every few seconds even when nothing but a truck's
    // progress ticked forward — only reset the camera when the actual set of tracked
    // orders changes, so recentering never overrides a pan/zoom the user just made.
    const signature = routes.map((route) => route.id).sort().join(',');
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
      map.setCenter(CEBU_CENTER);
      map.setZoom(10);
    }
  }, [mapReady, routes, roadGeometries]);

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
