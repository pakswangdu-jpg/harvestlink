import { useEffect, useRef, useState } from 'react';
import { Maximize, Minimize } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { resolveRoutePoints } from '../../utils/geo';
import { useMapCoordinates } from '../../hooks/useMapCoordinates';
import { fetchRoadRoute, pointAlongRoute } from '../../services/routingService';

const CEBU_CENTER = [10.3157, 123.8854];

const PRECISION_LABELS = {
  address: 'Exact registered address',
  municipality: 'Approximate — municipality center',
  fallback: 'Approximate — municipality area',
};

function withAlpha(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function pin(color) {
  return L.divIcon({
    className: 'map-pin',
    html: `<span style="background:${color}"></span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

// Reference-layer pins (other farmers/registered buyers) pulse an alert ring so they draw
// attention on a dashboard that's otherwise mostly about the active route, not just sitting
// there as a static, easy-to-miss dot.
function alertPin(color) {
  return L.divIcon({
    className: 'map-pin',
    html: `<span class="map-pin-pulse" style="--pulse-color:${withAlpha(color, 0.6)}"></span><span style="background:${color}"></span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

function truckIcon() {
  return L.divIcon({
    className: 'map-truck',
    html: '🚚',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

function pointKey(point) {
  return `${point.lat.toFixed(4)},${point.lng.toFixed(4)}`;
}

// `routes`: [{ id, originLabel, destinationLabel, originMunicipality, destinationMunicipality, deliveryMethod, progress, label, href, etaMinutes }]
// `farmers`: optional [{ id, name, farmName, municipality }] — DTI-verified farmers plotted
// as a reference layer alongside the live delivery routes (e.g. on the buyer dashboard).
// `buyers`: optional [{ id, name, municipality }] — registered buyers plotted the same way
// (e.g. on the farmer dashboard, so a farmer can see who's nearby).
// `alertStyle`: when true, the farmer/buyer reference pins (not the route pins) pulse to
// draw attention, the same treatment used for surplus-donation pins on the farmer map.
export default function DeliveryMap({ routes, farmers = [], buyers = [], alertStyle = false }) {
  const wrapperRef = useRef(null);
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layerGroupRef = useRef(null);
  const farmerLayerGroupRef = useRef(null);
  const buyerLayerGroupRef = useRef(null);
  const fittedSignatureRef = useRef(null);
  const requestedRouteKeysRef = useRef(new Set());
  const [isFullscreen, setIsFullscreen] = useState(false);
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

    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: false,
      // Fractional zoom steps + a higher wheel threshold make zooming feel smooth and
      // controllable instead of jumping multiple whole levels per scroll tick.
      zoomSnap: 0.5,
      zoomDelta: 0.5,
      wheelPxPerZoomLevel: 120,
    });
    mapRef.current = map;
    map.setView(CEBU_CENTER, 10);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(map);
    layerGroupRef.current = L.layerGroup().addTo(map);
    farmerLayerGroupRef.current = L.layerGroup().addTo(map);
    buyerLayerGroupRef.current = L.layerGroup().addTo(map);

    // The container's real size is only final after the CSS grid layout settles, which
    // can happen after Leaflet's own initial measurement — without this, zoom/pan math
    // is computed against a stale size and panning/zooming can look subtly broken.
    const resizeObserver = new ResizeObserver(() => map.invalidateSize());
    resizeObserver.observe(containerRef.current);
    const initialSizeFix = setTimeout(() => map.invalidateSize(), 100);

    return () => {
      clearTimeout(initialSizeFix);
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
      farmerLayerGroupRef.current = null;
      buyerLayerGroupRef.current = null;
    };
  }, []);

  useEffect(() => {
    const layerGroup = farmerLayerGroupRef.current;
    if (!layerGroup) return;

    layerGroup.clearLayers();
    farmers.forEach((farmer) => {
      const coords = farmerCoordsById[farmer.id];
      if (!coords) return;
      const displayName = farmer.farmName || farmer.name;
      const icon = alertStyle ? alertPin('#b45309') : pin('#b45309');
      L.marker([coords.lat, coords.lng], { icon })
        .bindPopup(
          `<strong>${displayName}</strong><br/>${farmer.name}<br/>${farmer.municipality}` +
          `<br/><small>${PRECISION_LABELS[coords.precision] || PRECISION_LABELS.fallback}</small>` +
          `<br/><a href="/marketplace?search=${encodeURIComponent(displayName)}">View products</a>` +
          `<br/><a href="/marketplace?search=${encodeURIComponent(displayName)}">Contact farmer</a>`
        )
        .bindTooltip(displayName)
        .addTo(layerGroup);
    });
  }, [farmers, farmerCoordsById, alertStyle]);

  useEffect(() => {
    const layerGroup = buyerLayerGroupRef.current;
    if (!layerGroup) return;

    layerGroup.clearLayers();
    buyers.forEach((buyer) => {
      const coords = buyerCoordsById[buyer.id];
      if (!coords) return;
      const icon = alertStyle ? alertPin('#1d4ed8') : pin('#1d4ed8');
      L.marker([coords.lat, coords.lng], { icon })
        .bindPopup(
          `<strong>${buyer.name}</strong><br/>${buyer.municipality}` +
          (buyer.contactNumber ? `<br/>${buyer.contactNumber}` : '') +
          `<br/><small>${PRECISION_LABELS[coords.precision] || PRECISION_LABELS.fallback}</small>`
        )
        .bindTooltip(buyer.name)
        .addTo(layerGroup);
    });
  }, [buyers, buyerCoordsById, alertStyle]);

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
    const layerGroup = layerGroupRef.current;
    if (!map || !layerGroup) return;

    layerGroup.clearLayers();
    const allPoints = [];

    routes.forEach((route) => {
      const { origin, destination, isPickup } = resolveRoutePoints(route);

      L.marker([origin.lat, origin.lng], { icon: pin('#15803d') }).bindTooltip(route.originLabel).addTo(layerGroup);
      allPoints.push([origin.lat, origin.lng]);

      L.marker([destination.lat, destination.lng], { icon: pin('#1d4ed8') }).bindTooltip(route.destinationLabel).addTo(layerGroup);
      allPoints.push([destination.lat, destination.lng]);

      // Falls back to a straight line only until the real road geometry resolves (or if
      // the routing service is unreachable) — never blocks rendering on the fetch.
      const roadPoints = roadGeometries[`${pointKey(origin)}|${pointKey(destination)}`];
      const pathPoints = roadPoints?.length > 1 ? roadPoints : [origin, destination];
      const latLngPath = pathPoints.map((point) => [point.lat, point.lng]);

      // A white casing drawn underneath keeps the route line readable against any tile
      // color (dense street yellows/oranges, green cover, blue water) instead of blending
      // into whatever's directly beneath it.
      L.polyline(latLngPath, { color: '#ffffff', weight: 7, opacity: 0.9 }).addTo(layerGroup);
      L.polyline(latLngPath, { color: '#ea580c', weight: 4, dashArray: '1 10', lineCap: 'round' }).addTo(layerGroup);

      // Pickup orders have no truck to track — the buyer travels there on their own
      // schedule, so the route just shows how to get there, not a live position/ETA.
      if (!isPickup) {
        const truckPosition = pointAlongRoute(pathPoints, route.progress);
        const truckMarker = L.marker([truckPosition.lat, truckPosition.lng], { icon: truckIcon() }).addTo(layerGroup);
        const popupText = route.label || `${route.originLabel} → ${route.destinationLabel}`;
        const etaText = route.etaMinutes != null ? `<br/><small>ETA ~${route.etaMinutes} min${route.etaMinutes === 1 ? '' : 's'}</small>` : '';
        truckMarker.bindPopup((route.href ? `<a href="${route.href}">${popupText}</a>` : popupText) + etaText);
      }
    });

    // Live polling rebuilds `routes` every few seconds even when nothing but a truck's
    // progress ticked forward — only reset the camera when the actual set of tracked
    // orders changes, so recentering never overrides a pan/zoom the user just made.
    const signature = routes.map((route) => route.id).sort().join(',');
    if (signature === fittedSignatureRef.current) return;
    fittedSignatureRef.current = signature;

    if (allPoints.length === 1) {
      map.setView(allPoints[0], 13);
    } else if (allPoints.length > 1) {
      map.fitBounds(allPoints, { padding: [36, 36] });
    } else {
      map.setView(CEBU_CENTER, 10);
    }
  }, [routes, roadGeometries]);

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
