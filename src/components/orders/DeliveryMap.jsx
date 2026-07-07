import { useEffect, useRef, useState } from 'react';
import { Maximize, Minimize } from 'lucide-react';
import { getMunicipalityCoords } from '../../utils/constants';
import { useMapCoordinates } from '../../hooks/useMapCoordinates';
import { loadGoogleMaps } from '../../services/googleMapsLoader';

const CEBU_CENTER = { lat: 10.3157, lng: 123.8854 };

const PRECISION_LABELS = {
  address: 'Exact registered address',
  municipality: 'Approximate — municipality center',
  fallback: 'Approximate — municipality area',
};

function dotIcon(maps, color) {
  return {
    path: maps.SymbolPath.CIRCLE,
    scale: 8,
    fillColor: color,
    fillOpacity: 1,
    strokeColor: '#ffffff',
    strokeWeight: 3,
  };
}

// A fully transparent base icon just gives the emoji label an anchor point to center on
// — Google Marker labels are drawn relative to the icon, not standalone.
function truckIcon(maps) {
  return {
    path: maps.SymbolPath.CIRCLE,
    scale: 13,
    fillOpacity: 0,
    strokeOpacity: 0,
  };
}

function interpolate(origin, destination, fraction) {
  return {
    lat: origin.lat + (destination.lat - origin.lat) * fraction,
    lng: origin.lng + (destination.lng - origin.lng) * fraction,
  };
}

// `routes`: [{ id, originLabel, destinationLabel, originMunicipality, destinationMunicipality, progress, label, href }]
// `farmers`: optional [{ id, name, farmName, municipality }] — DTI-verified farmers plotted
// as a reference layer alongside the live delivery routes (e.g. on the buyer dashboard).
// `buyers`: optional [{ id, name, municipality }] — registered buyers plotted the same way
// (e.g. on the farmer dashboard, so a farmer can see who's nearby).
// `alertStyle`: when true, the farmer/buyer reference pins (not the route pins) bounce
// continuously to draw attention, the same treatment used for surplus-donation pins.
export default function DeliveryMap({ routes, farmers = [], buyers = [], alertStyle = false }) {
  const wrapperRef = useRef(null);
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const mapsRef = useRef(null);
  const infoWindowRef = useRef(null);
  const resizeObserverRef = useRef(null);
  const routeMarkersRef = useRef([]);
  const farmerMarkersRef = useRef([]);
  const buyerMarkersRef = useRef([]);
  const fittedSignatureRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isReady, setIsReady] = useState(false);
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
    let cancelled = false;

    loadGoogleMaps().then((maps) => {
      if (cancelled || !containerRef.current || mapRef.current) return;

      mapsRef.current = maps;
      const map = new maps.Map(containerRef.current, {
        center: CEBU_CENTER,
        zoom: 10,
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: false,
      });
      mapRef.current = map;
      infoWindowRef.current = new maps.InfoWindow();

      // The container's real size is only final after the CSS grid layout settles, which
      // can happen after the map's own initial measurement — without this, a map created
      // inside a not-yet-sized flex/grid cell can render at the wrong dimensions.
      const resizeObserver = new ResizeObserver(() => maps.event.trigger(map, 'resize'));
      resizeObserver.observe(containerRef.current);
      resizeObserverRef.current = resizeObserver;

      setIsReady(true);
    });

    return () => {
      cancelled = true;
      resizeObserverRef.current?.disconnect();
    };
  }, []);

  useEffect(() => {
    const maps = mapsRef.current;
    const map = mapRef.current;
    const infoWindow = infoWindowRef.current;
    if (!maps || !map) return;

    farmerMarkersRef.current.forEach((marker) => marker.setMap(null));
    farmerMarkersRef.current = [];

    farmers.forEach((farmer) => {
      const coords = farmerCoordsById[farmer.id];
      if (!coords) return;
      const displayName = farmer.farmName || farmer.name;

      const marker = new maps.Marker({
        position: coords,
        map,
        icon: dotIcon(maps, '#b45309'),
        title: displayName,
        animation: alertStyle ? maps.Animation.BOUNCE : undefined,
      });
      const content =
        `<strong>${displayName}</strong><br/>${farmer.name}<br/>${farmer.municipality}` +
        `<br/><small>${PRECISION_LABELS[coords.precision] || PRECISION_LABELS.fallback}</small>` +
        `<br/><a href="/marketplace?search=${encodeURIComponent(displayName)}">View products</a>` +
        `<br/><a href="/marketplace?search=${encodeURIComponent(displayName)}">Contact farmer</a>`;
      marker.addListener('click', () => {
        infoWindow.setContent(content);
        infoWindow.open({ map, anchor: marker });
      });
      farmerMarkersRef.current.push(marker);
    });
  }, [isReady, farmers, farmerCoordsById, alertStyle]);

  useEffect(() => {
    const maps = mapsRef.current;
    const map = mapRef.current;
    const infoWindow = infoWindowRef.current;
    if (!maps || !map) return;

    buyerMarkersRef.current.forEach((marker) => marker.setMap(null));
    buyerMarkersRef.current = [];

    buyers.forEach((buyer) => {
      const coords = buyerCoordsById[buyer.id];
      if (!coords) return;

      const marker = new maps.Marker({
        position: coords,
        map,
        icon: dotIcon(maps, '#1d4ed8'),
        title: buyer.name,
        animation: alertStyle ? maps.Animation.BOUNCE : undefined,
      });
      const content =
        `<strong>${buyer.name}</strong><br/>${buyer.municipality}` +
        (buyer.contactNumber ? `<br/>${buyer.contactNumber}` : '') +
        `<br/><small>${PRECISION_LABELS[coords.precision] || PRECISION_LABELS.fallback}</small>`;
      marker.addListener('click', () => {
        infoWindow.setContent(content);
        infoWindow.open({ map, anchor: marker });
      });
      buyerMarkersRef.current.push(marker);
    });
  }, [isReady, buyers, buyerCoordsById, alertStyle]);

  useEffect(() => {
    const maps = mapsRef.current;
    const map = mapRef.current;
    const infoWindow = infoWindowRef.current;
    if (!maps || !map) return;

    routeMarkersRef.current.forEach((marker) => marker.setMap(null));
    routeMarkersRef.current = [];
    const allPoints = [];

    routes.forEach((route) => {
      const origin = getMunicipalityCoords(route.originMunicipality);
      const destination = getMunicipalityCoords(route.destinationMunicipality);
      const samePoint = route.originMunicipality === route.destinationMunicipality;

      routeMarkersRef.current.push(
        new maps.Marker({ position: origin, map, icon: dotIcon(maps, '#15803d'), title: route.originLabel })
      );
      allPoints.push(origin);

      if (!samePoint) {
        routeMarkersRef.current.push(
          new maps.Marker({ position: destination, map, icon: dotIcon(maps, '#1d4ed8'), title: route.destinationLabel })
        );
        allPoints.push(destination);

        routeMarkersRef.current.push(
          new maps.Polyline({
            map,
            path: [origin, destination],
            strokeColor: '#8fb99b',
            strokeWeight: 3,
            strokeOpacity: 0.8,
          })
        );

        const truckPosition = interpolate(origin, destination, route.progress);
        const truckMarker = new maps.Marker({
          position: truckPosition,
          map,
          icon: truckIcon(maps),
          label: { text: '🚚', fontSize: '20px' },
          zIndex: 10,
        });
        const popupText = route.label || `${route.originLabel} → ${route.destinationLabel}`;
        const etaText = route.etaMinutes != null ? `<br/><small>ETA ~${route.etaMinutes} min${route.etaMinutes === 1 ? '' : 's'}</small>` : '';
        const content = (route.href ? `<a href="${route.href}">${popupText}</a>` : popupText) + etaText;
        truckMarker.addListener('click', () => {
          infoWindow.setContent(content);
          infoWindow.open({ map, anchor: truckMarker });
        });
        routeMarkersRef.current.push(truckMarker);
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
      const bounds = new maps.LatLngBounds();
      allPoints.forEach((point) => bounds.extend(point));
      map.fitBounds(bounds, 36);
    } else {
      map.setCenter(CEBU_CENTER);
      map.setZoom(10);
    }
  }, [isReady, routes]);

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
