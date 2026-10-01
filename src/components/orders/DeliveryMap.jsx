import { useEffect, useRef, useState } from 'react';
import { Maximize, Minimize } from 'lucide-react';
import { DARK_MAP_STYLE, loadGoogleMaps } from '../../lib/googleMapsLoader';
import { getMunicipalityCoords } from '../../utils/constants';
import { haversineKm, resolveRoutePoints, validateCoordinates, nearbyMapPoints } from '../../utils/geo';
import { useMapCoordinates } from '../../hooks/useMapCoordinates';
import { distanceToPolylineKm, fetchRoadRoute, pointAlongRoute } from '../../services/routingService';
import { useTheme } from '../../contexts/ThemeContext';
import { MAP_COLORS } from '../../lib/mapMarkerColors';
import { buildMapPopup, buildPresenceMarkup } from '../map/mapPopupMarkup';

import { buildViewerIcon, buildViewerPopup } from '../map/userLocationMarker';

const CEBU_CENTER = { lat: 10.3157, lng: 123.8854 };




const ROUTE_LINE_COLOR = '#1a73e8';







const LIVE_REROUTE_MIN_INTERVAL_MS = 20000;
const LIVE_REROUTE_MIN_MOVE_KM = 0.05;
const LIVE_REROUTE_DEVIATION_KM = 0.08;
const LIVE_REROUTE_DEVIATION_COOLDOWN_MS = 8000;
const MARKER_ANIMATION_DURATION_MS = 1500;

const PRECISION_LABELS = {
  registered: 'Registered location',
  address: 'Exact registered address',
  municipality: 'Approximate — municipality center',
  fallback: 'Approximate — municipality area',
};



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



















export default function DeliveryMap({
  routes = [],
  farmers = [],
  buyers = [],
  stakeholders = [],
  alertStyle = false,
  viewerMunicipality = null,
  viewerCoords = null,
  viewerAddress = '',
  nearbyView = false,
}) {
  const wrapperRef = useRef(null);
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const mapsApiRef = useRef(null);
  const routeLayerRef = useRef([]);
  const farmerMarkersRef = useRef([]);
  const buyerMarkersRef = useRef([]);
  const stakeholderMarkersRef = useRef([]);
  const viewerMarkerRef = useRef(null);
  const markerSignaturesRef = useRef({ farmers: null, buyers: null, stakeholders: null });
  const fittedSignatureRef = useRef(null);
  const requestedRouteKeysRef = useRef(new Set());



  const truckMarkersRef = useRef({});



  const liveRouteMetaRef = useRef({});
  const pendingLiveFetchRef = useRef(new Set());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const { effectiveTheme } = useTheme();
  const [roadGeometries, setRoadGeometries] = useState({});
  const [liveRouteGeometries, setLiveRouteGeometries] = useState({});
  const farmerCoordsById = useMapCoordinates(farmers, { registeredOnly: nearbyView });
  const buyerCoordsById = useMapCoordinates(buyers, { registeredOnly: nearbyView });
  const stakeholderCoordsById = useMapCoordinates(stakeholders, { registeredOnly: nearbyView });






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
      const center = validateCoordinates(viewerCoords?.lat, viewerCoords?.lng);
      const map = new mapsApi.Map(containerRef.current, {
        ...(center ? { center } : nearbyView ? {} : { center: CEBU_CENTER }),
        zoom: 10,
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: nearbyView ? 'cooperative' : 'greedy',
        clickableIcons: false,
        styles: effectiveTheme === 'dark' ? DARK_MAP_STYLE : [],
      });
      mapRef.current = map;
      mapsApiRef.current = mapsApi;
      setMapReady(true);
    });

    return () => {
      cancelled = true;
    };



    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);




  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    mapRef.current.setOptions({ styles: effectiveTheme === 'dark' ? DARK_MAP_STYLE : [] });
  }, [effectiveTheme, mapReady]);





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

    const signature = farmers.map((farmer) => {
      const coords = farmerCoordsById[farmer.id];
      return `${farmer.id}:${coords?.lat || ''},${coords?.lng || ''}:${coords?.precision || ''}`;
    }).join('|') + `:${alertStyle}`;
    if (signature === markerSignaturesRef.current.farmers) return;
    markerSignaturesRef.current.farmers = signature;

    farmerMarkersRef.current.forEach((marker) => marker.setMap(null));
    farmerMarkersRef.current = [];
    farmers.forEach((farmer) => {
      const coords = farmerCoordsById[farmer.id];
      if (!coords) return;
      const displayName = farmer.farmName || farmer.name;
      const marker = new mapsApi.Marker({
        position: coords,
        map,
        icon: buildPinIcon(mapsApi, MAP_COLORS.farmer, { alert: alertStyle }),
        title: displayName,
      });
      const infoWindow = new mapsApi.InfoWindow({
        content: buildMapPopup({
          name: displayName,
          person: farmer.name,
          municipality: farmer.municipality,
          address: farmer.address,
          barangay: farmer.barangay,
          coords,
          presence: buildPresenceMarkup(farmer),
          precision: PRECISION_LABELS[coords.precision] || PRECISION_LABELS.fallback,
          links: [
            { href: `/marketplace?farmerId=${farmer.id}&farmerName=${encodeURIComponent(displayName)}`, label: 'View products' },
            { href: `/messages/direct/${farmer.id}`, label: 'Contact farmer' },
          ],
        }),
      });
      marker.addListener('click', () => infoWindow.open({ map, anchor: marker }));
      farmerMarkersRef.current.push(marker);
    });
  }, [mapReady, farmers, farmerCoordsById, alertStyle]);

  useEffect(() => {
    const map = mapRef.current;
    const mapsApi = mapsApiRef.current;
    if (!mapReady || !map || !mapsApi) return;

    const lat = Number(viewerCoords?.lat);
    const lng = Number(viewerCoords?.lng);
    const hasViewerPoint = validateCoordinates(viewerCoords?.lat, viewerCoords?.lng);

    if (!hasViewerPoint) {
      if (viewerMarkerRef.current) {
        viewerMarkerRef.current.marker.setMap(null);
        viewerMarkerRef.current.infoWindow.close();
      }
      return;
    }

    const position = { lat, lng };
    if (!viewerMarkerRef.current) {
      const marker = new mapsApi.Marker({
        position,
        map,
        icon: buildViewerIcon(mapsApi),
        title: 'Your location',
        zIndex: 900,
      });
      const infoWindow = new mapsApi.InfoWindow({
        content: buildViewerPopup(viewerAddress),
      });
      marker.addListener('click', () => infoWindow.open({ map, anchor: marker }));
      viewerMarkerRef.current = { marker, infoWindow };
      return;
    }

    viewerMarkerRef.current.infoWindow.setContent(buildViewerPopup(viewerAddress));
    viewerMarkerRef.current.marker.setMap(map);
    viewerMarkerRef.current.marker.setPosition(position);
  }, [mapReady, viewerCoords?.lat, viewerCoords?.lng, viewerAddress]);

  useEffect(() => {
    const map = mapRef.current;
    const mapsApi = mapsApiRef.current;
    if (!mapReady || !map || !mapsApi) return;

    const signature = buyers.map((buyer) => {
      const coords = buyerCoordsById[buyer.id];
      return `${buyer.id}:${coords?.lat || ''},${coords?.lng || ''}:${coords?.precision || ''}`;
    }).join('|');
    if (signature === markerSignaturesRef.current.buyers) return;
    markerSignaturesRef.current.buyers = signature;

    buyerMarkersRef.current.forEach((marker) => marker.setMap(null));
    buyerMarkersRef.current = [];
    buyers.forEach((buyer) => {
      const coords = buyerCoordsById[buyer.id];
      if (!coords) return;



      const marker = new mapsApi.Marker({
        position: coords,
        map,
        icon: buildPinIcon(mapsApi, MAP_COLORS.buyer, { alert: alertStyle }),
        title: buyer.name,
      });
      const infoWindow = new mapsApi.InfoWindow({
        content: buildMapPopup({
          name: buyer.name,
          municipality: buyer.municipality,
          address: buyer.address,
          barangay: buyer.barangay,
          coords,
          contactNumber: buyer.contactNumber,
          presence: buildPresenceMarkup(buyer),
          precision: PRECISION_LABELS[coords.precision] || PRECISION_LABELS.fallback,
          links: [{ href: `/messages/direct/${buyer.id}`, label: 'Contact buyer' }],
        }),
      });
      marker.addListener('click', () => infoWindow.open({ map, anchor: marker }));
      buyerMarkersRef.current.push(marker);
    });
  }, [mapReady, buyers, buyerCoordsById, alertStyle]);

  useEffect(() => {
    const map = mapRef.current;
    const mapsApi = mapsApiRef.current;
    if (!mapReady || !map || !mapsApi) return;

    const signature = stakeholders.map((stakeholder) => {
      const coords = stakeholderCoordsById[stakeholder.id];
      return `${stakeholder.id}:${coords?.lat || ''},${coords?.lng || ''}:${coords?.precision || ''}`;
    }).join('|');
    if (signature === markerSignaturesRef.current.stakeholders) return;
    markerSignaturesRef.current.stakeholders = signature;

    stakeholderMarkersRef.current.forEach((marker) => marker.setMap(null));
    stakeholderMarkersRef.current = [];
    stakeholders.forEach((stakeholder) => {
      const coords = stakeholderCoordsById[stakeholder.id];
      if (!coords) return;
      const displayName = stakeholder.organizationName || stakeholder.name;
      const marker = new mapsApi.Marker({
        position: coords,
        map,
        icon: buildPinIcon(mapsApi, MAP_COLORS.stakeholder, { alert: alertStyle }),
        title: displayName,
      });
      const infoWindow = new mapsApi.InfoWindow({
        content: buildMapPopup({
          name: displayName,
          person: stakeholder.contactPerson,
          municipality: stakeholder.municipality,
          address: stakeholder.address,
          barangay: stakeholder.barangay,
          coords,
          contactNumber: stakeholder.contactNumber,
          presence: buildPresenceMarkup(stakeholder),
          precision: PRECISION_LABELS[coords.precision] || PRECISION_LABELS.fallback,
          links: [{ href: `/messages/direct/${stakeholder.id}`, label: 'Contact stakeholder' }],
        }),
      });
      marker.addListener('click', () => infoWindow.open({ map, anchor: marker }));
      stakeholderMarkersRef.current.push(marker);
    });
  }, [mapReady, stakeholders, stakeholderCoordsById, alertStyle]);








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
    routes.forEach((route) => {
      if (!route.currentPosition) return;
      const { origin, destination, isPickup } = resolveRoutePoints(route);
      const travelTarget = isPickup ? origin : destination;

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

      fetchRoadRoute(route.currentPosition, travelTarget, { skipCache: true }).then((result) => {
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
    let allPoints = [];
    const truckRouteIdsThisRender = new Set();

    routes.forEach((route) => {
      const { origin, destination, isPickup } = resolveRoutePoints(route);

      const originMarker = new mapsApi.Marker({ position: origin, map, icon: buildPinIcon(mapsApi, MAP_COLORS.origin), title: route.originLabel });
      routeLayerRef.current.push(originMarker);
      allPoints.push(origin);

      const destinationMarker = new mapsApi.Marker({ position: destination, map, icon: buildPinIcon(mapsApi, MAP_COLORS.destination), title: route.destinationLabel });
      routeLayerRef.current.push(destinationMarker);
      allPoints.push(destination);
      if (route.currentPosition) allPoints.push(route.currentPosition);






      const travelTarget = isPickup ? origin : destination;
      const isLiveNavigating = Boolean(route.currentPosition);
      const liveRoute = isLiveNavigating ? liveRouteGeometries[route.id] : null;
      const staticRoadPoints = roadGeometries[`${pointKey(origin)}|${pointKey(destination)}`];
      const pathPoints = liveRoute?.points?.length > 1
        ? liveRoute.points
        : isLiveNavigating
          ? [route.currentPosition, travelTarget]
          : (staticRoadPoints?.length > 1 ? staticRoadPoints : [origin, destination]);




      const casing = new mapsApi.Polyline({ path: pathPoints, strokeColor: '#ffffff', strokeWeight: 8, strokeOpacity: 0.9, map });
      routeLayerRef.current.push(casing);
      const routeLine = new mapsApi.Polyline({ path: pathPoints, strokeColor: ROUTE_LINE_COLOR, strokeWeight: 5, strokeOpacity: 0.95, map });
      routeLayerRef.current.push(routeLine);





      const truckPosition = route.currentPosition || pointAlongRoute(pathPoints, route.progress);
      if (!truckPosition) return;
      truckRouteIdsThisRender.add(route.id);

      const popupText = route.label || `${route.originLabel} → ${route.destinationLabel}`;
      const etaText = route.etaMinutes != null ? `<br/><small>ETA ~${route.etaMinutes} min${route.etaMinutes === 1 ? '' : 's'}</small>` : '';
      const distanceText = route.remainingKm != null ? `<br/><small>${route.remainingKm.toFixed(1)} km remaining</small>` : '';
      const positionSourceText = `<br/><small>${route.currentPosition ? '📍 Live GPS location' : 'Estimated position'}</small>`;
      const infoHtml = (route.href ? `<a href="${route.href}">${popupText}</a>` : popupText) + etaText + distanceText + positionSourceText;






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



    Object.keys(truckMarkersRef.current).forEach((routeId) => {
      if (truckRouteIdsThisRender.has(routeId)) return;
      const entry = truckMarkersRef.current[routeId];
      if (entry.animationFrameId != null) cancelAnimationFrame(entry.animationFrameId);
      entry.marker.setMap(null);
      delete truckMarkersRef.current[routeId];
    });





    Object.values(farmerCoordsById).forEach((coords) => allPoints.push(coords));
    Object.values(buyerCoordsById).forEach((coords) => allPoints.push(coords));
    Object.values(stakeholderCoordsById).forEach((coords) => allPoints.push(coords));
    const viewerLat = Number(viewerCoords?.lat);
    const viewerLng = Number(viewerCoords?.lng);
    const viewerPoint = validateCoordinates(viewerCoords?.lat, viewerCoords?.lng);
    if (nearbyView && viewerPoint) {
      allPoints = nearbyMapPoints(viewerPoint, farmers.map((farmer) => farmerCoordsById[farmer.id]).filter(Boolean));
    } else if (viewerPoint) {
      allPoints.push({ lat: viewerLat, lng: viewerLng });
    } else if (viewerMunicipality && !nearbyView) {
      allPoints.push(getMunicipalityCoords(viewerMunicipality));
    }





    const signature = [
      routes.map((route) => route.id).sort().join(','),
      farmers.map((farmer) => farmer.id).sort().join(','),
      buyers.map((buyer) => buyer.id).sort().join(','),
      stakeholders.map((stakeholder) => stakeholder.id).sort().join(','),
      Number.isFinite(viewerLat) && Number.isFinite(viewerLng) ? `${viewerLat.toFixed(5)},${viewerLng.toFixed(5)}` : '',
      viewerMunicipality || '',
      nearbyView ? allPoints.map((point) => `${point.lat},${point.lng}`).join(';') : '',
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
      if (nearbyView) mapsApi.event.addListenerOnce(map, 'idle', () => {
        if (map.getZoom() > 16) map.setZoom(16);
      });
    } else if (!nearbyView) {
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
    nearbyView,
    viewerCoords?.lat,
    viewerCoords?.lng,
  ]);

  return (
    <div ref={wrapperRef} className={`delivery-map-wrapper ${isFullscreen ? 'fullscreen' : ''}`}>
      <button
        type="button"
        className="map-fullscreen-toggle"
        onClick={toggleFullscreen}
        aria-label={isFullscreen ? 'Exit full view' : 'View map fully'}
        title={isFullscreen ? 'Exit full view' : 'View map fully'}
        aria-pressed={isFullscreen}
      >
        {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
      </button>
      <div ref={containerRef} className="delivery-map" />
    </div>
  );
}
