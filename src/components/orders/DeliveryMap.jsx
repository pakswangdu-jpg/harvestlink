import { useEffect, useRef, useState } from 'react';
import { Maximize, Minimize } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getMunicipalityCoords } from '../../utils/constants';
import { useMapCoordinates } from '../../hooks/useMapCoordinates';

const CEBU_CENTER = [10.3157, 123.8854];

const FARMER_PRECISION_LABELS = {
  address: 'Exact registered address',
  municipality: 'Approximate — municipality center',
  fallback: 'Approximate — municipality area',
};

function pin(color) {
  return L.divIcon({
    className: 'map-pin',
    html: `<span style="background:${color}"></span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

function farmPin() {
  return L.divIcon({
    className: 'map-pin',
    html: '<span style="background:#b45309"></span>',
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

function interpolate(origin, destination, fraction) {
  return {
    lat: origin.lat + (destination.lat - origin.lat) * fraction,
    lng: origin.lng + (destination.lng - origin.lng) * fraction,
  };
}

// `routes`: [{ id, originLabel, destinationLabel, originMunicipality, destinationMunicipality, progress, label, href }]
// `farmers`: optional [{ id, name, farmName, municipality }] — DTI-verified farmers plotted
// as a reference layer alongside the live delivery routes (e.g. on the buyer dashboard).
export default function DeliveryMap({ routes, farmers = [] }) {
  const wrapperRef = useRef(null);
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layerGroupRef = useRef(null);
  const farmerLayerGroupRef = useRef(null);
  const fittedSignatureRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const farmerCoordsById = useMapCoordinates(farmers);

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
      L.marker([coords.lat, coords.lng], { icon: farmPin() })
        .bindPopup(
          `<strong>${displayName}</strong><br/>${farmer.name}<br/>${farmer.municipality}` +
          `<br/><small>${FARMER_PRECISION_LABELS[coords.precision] || FARMER_PRECISION_LABELS.fallback}</small>` +
          `<br/><a href="/marketplace?search=${encodeURIComponent(displayName)}">View products</a>`
        )
        .bindTooltip(displayName)
        .addTo(layerGroup);
    });
  }, [farmers, farmerCoordsById]);

  useEffect(() => {
    const map = mapRef.current;
    const layerGroup = layerGroupRef.current;
    if (!map || !layerGroup) return;

    layerGroup.clearLayers();
    const allPoints = [];

    routes.forEach((route) => {
      const origin = getMunicipalityCoords(route.originMunicipality);
      const destination = getMunicipalityCoords(route.destinationMunicipality);
      const samePoint = route.originMunicipality === route.destinationMunicipality;

      L.marker([origin.lat, origin.lng], { icon: pin('#15803d') }).bindTooltip(route.originLabel).addTo(layerGroup);
      allPoints.push([origin.lat, origin.lng]);

      if (!samePoint) {
        L.marker([destination.lat, destination.lng], { icon: pin('#1d4ed8') }).bindTooltip(route.destinationLabel).addTo(layerGroup);
        allPoints.push([destination.lat, destination.lng]);

        L.polyline([[origin.lat, origin.lng], [destination.lat, destination.lng]], {
          color: '#8fb99b',
          weight: 3,
          dashArray: '6 8',
        }).addTo(layerGroup);

        const truckPosition = interpolate(origin, destination, route.progress);
        const truckMarker = L.marker([truckPosition.lat, truckPosition.lng], { icon: truckIcon() }).addTo(layerGroup);
        const popupText = route.label || `${route.originLabel} → ${route.destinationLabel}`;
        truckMarker.bindPopup(route.href ? `<a href="${route.href}">${popupText}</a>` : popupText);
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
  }, [routes]);

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
