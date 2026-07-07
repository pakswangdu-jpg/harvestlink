import { useEffect, useRef, useState } from 'react';
import { Maximize, Minimize } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useMapCoordinates } from '../../hooks/useMapCoordinates';

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

// Donation pins pulse a red alert ring so a stakeholder scanning the map notices new
// surplus produce immediately, instead of it blending in as just another static pin.
function alertPin(color) {
  return L.divIcon({
    className: 'map-pin',
    html: `<span class="map-pin-pulse" style="--pulse-color:${withAlpha(color, 0.6)}"></span><span style="background:${color}"></span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

export default function FarmerMap({ farmers = [], buyers = [], donationFarmers = [], selectedId, onSelectPin }) {
  const wrapperRef = useRef(null);
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layerGroupRef = useRef(null);
  const markersRef = useRef({});
  const fittedSignatureRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const farmerCoordsById = useMapCoordinates(farmers);
  const buyerCoordsById = useMapCoordinates(buyers);
  const donationFarmerCoordsById = useMapCoordinates(donationFarmers);

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
    map.setView(CEBU_CENTER, 9);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(map);
    layerGroupRef.current = L.layerGroup().addTo(map);

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
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layerGroup = layerGroupRef.current;
    if (!map || !layerGroup) return;

    layerGroup.clearLayers();
    markersRef.current = {};
    const allPoints = [];

    farmers.forEach((farmer) => {
      const coords = farmerCoordsById[farmer.id];
      if (!coords) return;
      allPoints.push([coords.lat, coords.lng]);

      const marker = L.marker([coords.lat, coords.lng], { icon: pin('#15803d') }).addTo(layerGroup);
      const displayName = farmer.farmName || farmer.name;
      marker.bindPopup(
        `<strong>${displayName}</strong><br/>` +
        `${farmer.name}<br/>` +
        `${farmer.municipality}` +
        (farmer.contactNumber ? `<br/>${farmer.contactNumber}` : '') +
        `<br/><small>${PRECISION_LABELS[coords.precision] || PRECISION_LABELS.fallback}</small>` +
        `<br/><a href="/marketplace?search=${encodeURIComponent(displayName)}">View products</a>` +
        `<br/><a href="/marketplace?search=${encodeURIComponent(displayName)}">Contact farmer</a>`
      );
      if (onSelectPin) marker.on('click', () => onSelectPin(farmer.id));
      markersRef.current[farmer.id] = marker;
    });

    buyers.forEach((buyer) => {
      const coords = buyerCoordsById[buyer.id];
      if (!coords) return;
      allPoints.push([coords.lat, coords.lng]);

      const marker = L.marker([coords.lat, coords.lng], { icon: pin('#1d4ed8') }).addTo(layerGroup);
      marker.bindPopup(
        `<strong>${buyer.name}</strong><br/>` +
        `${buyer.municipality}` +
        (buyer.contactNumber ? `<br/>${buyer.contactNumber}` : '') +
        `<br/><small>${PRECISION_LABELS[coords.precision] || PRECISION_LABELS.fallback}</small>`
      );
      if (onSelectPin) marker.on('click', () => onSelectPin(buyer.id));
      markersRef.current[buyer.id] = marker;
    });

    donationFarmers.forEach((farmer) => {
      const coords = donationFarmerCoordsById[farmer.id];
      if (!coords) return;
      allPoints.push([coords.lat, coords.lng]);

      const marker = L.marker([coords.lat, coords.lng], { icon: alertPin('#db2777') }).addTo(layerGroup);
      const displayName = farmer.farmName || farmer.name;
      const donationList = farmer.donations
        .map((donation) => `${donation.productName} — ${donation.quantity} ${donation.unit}`)
        .join('<br/>');
      marker.bindPopup(
        `<strong>${displayName}</strong><br/>` +
        `${farmer.name}<br/>` +
        `${farmer.municipality}` +
        (farmer.contactNumber ? `<br/>${farmer.contactNumber}` : '') +
        `<br/><small>${PRECISION_LABELS[coords.precision] || PRECISION_LABELS.fallback}</small>` +
        `<br/><br/><strong>Available donations</strong><br/>${donationList}`
      );
      if (onSelectPin) marker.on('click', () => onSelectPin(farmer.id));
      markersRef.current[farmer.id] = marker;
    });

    // Background geocoding progressively upgrades pin positions after the initial render
    // — only auto-fit the camera once per distinct set of accounts, so a later address-level
    // upgrade nudging a pin doesn't yank the user's manual pan/zoom back to "fit everything".
    const signature = [...farmers, ...buyers, ...donationFarmers].map((person) => person.id).sort().join(',');
    if (signature !== fittedSignatureRef.current) {
      fittedSignatureRef.current = signature;
      if (allPoints.length === 1) {
        map.setView(allPoints[0], 12);
      } else if (allPoints.length > 1) {
        map.fitBounds(allPoints, { padding: [40, 40] });
      } else {
        map.setView(CEBU_CENTER, 9);
      }
    }
  }, [farmers, buyers, donationFarmers, farmerCoordsById, buyerCoordsById, donationFarmerCoordsById, onSelectPin]);

  useEffect(() => {
    if (!selectedId) return;
    const marker = markersRef.current[selectedId];
    const map = mapRef.current;
    if (marker && map) {
      map.setView(marker.getLatLng(), 13, { animate: true });
      marker.openPopup();
    }
  }, [selectedId]);

  return (
    <div ref={wrapperRef} className={`farmer-map-wrapper ${isFullscreen ? 'fullscreen' : ''}`}>
      <button
        type="button"
        className="map-fullscreen-toggle"
        onClick={toggleFullscreen}
        aria-label={isFullscreen ? 'Exit full view' : 'View map fully'}
        title={isFullscreen ? 'Exit full view' : 'View map fully'}
      >
        {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
      </button>
      <div ref={containerRef} className="farmer-map" />
    </div>
  );
}
