import { useEffect, useRef, useState } from 'react';
import { Maximize, Minimize } from 'lucide-react';
import { loadGoogleMaps } from '../../services/googleMapsLoader';
import { useMapCoordinates } from '../../hooks/useMapCoordinates';

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

export default function FarmerMap({ farmers = [], buyers = [], donationFarmers = [], selectedId, onSelectPin }) {
  const wrapperRef = useRef(null);
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const mapsRef = useRef(null);
  const infoWindowRef = useRef(null);
  const resizeObserverRef = useRef(null);
  const markersRef = useRef({});
  const fittedSignatureRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isReady, setIsReady] = useState(false);
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
    let cancelled = false;

    loadGoogleMaps().then((maps) => {
      if (cancelled || !containerRef.current || mapRef.current) return;

      mapsRef.current = maps;
      const map = new maps.Map(containerRef.current, {
        center: CEBU_CENTER,
        zoom: 9,
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

    Object.values(markersRef.current).forEach((marker) => marker.setMap(null));
    markersRef.current = {};
    const allPoints = [];

    const openInfo = (marker, content) => {
      infoWindow.setContent(content);
      infoWindow.open({ map, anchor: marker });
    };

    farmers.forEach((farmer) => {
      const coords = farmerCoordsById[farmer.id];
      if (!coords) return;
      allPoints.push(coords);

      const marker = new maps.Marker({ position: coords, map, icon: dotIcon(maps, '#15803d') });
      const displayName = farmer.farmName || farmer.name;
      const content =
        `<strong>${displayName}</strong><br/>` +
        `${farmer.name}<br/>` +
        `${farmer.municipality}` +
        (farmer.contactNumber ? `<br/>${farmer.contactNumber}` : '') +
        `<br/><small>${PRECISION_LABELS[coords.precision] || PRECISION_LABELS.fallback}</small>` +
        `<br/><a href="/marketplace?search=${encodeURIComponent(displayName)}">View products</a>` +
        `<br/><a href="/marketplace?search=${encodeURIComponent(displayName)}">Contact farmer</a>`;
      marker.addListener('click', () => {
        openInfo(marker, content);
        onSelectPin?.(farmer.id);
      });
      markersRef.current[farmer.id] = marker;
    });

    buyers.forEach((buyer) => {
      const coords = buyerCoordsById[buyer.id];
      if (!coords) return;
      allPoints.push(coords);

      const marker = new maps.Marker({ position: coords, map, icon: dotIcon(maps, '#1d4ed8') });
      const content =
        `<strong>${buyer.name}</strong><br/>` +
        `${buyer.municipality}` +
        (buyer.contactNumber ? `<br/>${buyer.contactNumber}` : '') +
        `<br/><small>${PRECISION_LABELS[coords.precision] || PRECISION_LABELS.fallback}</small>`;
      marker.addListener('click', () => {
        openInfo(marker, content);
        onSelectPin?.(buyer.id);
      });
      markersRef.current[buyer.id] = marker;
    });

    donationFarmers.forEach((farmer) => {
      const coords = donationFarmerCoordsById[farmer.id];
      if (!coords) return;
      allPoints.push(coords);

      // Bounces continuously so a stakeholder scanning the map notices new surplus produce
      // immediately, instead of it blending in as just another static pin.
      const marker = new maps.Marker({
        position: coords,
        map,
        icon: dotIcon(maps, '#db2777'),
        animation: maps.Animation.BOUNCE,
      });
      const displayName = farmer.farmName || farmer.name;
      const donationList = farmer.donations
        .map((donation) => `${donation.productName} — ${donation.quantity} ${donation.unit}`)
        .join('<br/>');
      const content =
        `<strong>${displayName}</strong><br/>` +
        `${farmer.name}<br/>` +
        `${farmer.municipality}` +
        (farmer.contactNumber ? `<br/>${farmer.contactNumber}` : '') +
        `<br/><small>${PRECISION_LABELS[coords.precision] || PRECISION_LABELS.fallback}</small>` +
        `<br/><br/><strong>Available donations</strong><br/>${donationList}`;
      marker.addListener('click', () => {
        openInfo(marker, content);
        onSelectPin?.(farmer.id);
      });
      markersRef.current[farmer.id] = marker;
    });

    // Background geocoding progressively upgrades pin positions after the initial render
    // — only auto-fit the camera once per distinct set of accounts, so a later address-level
    // upgrade nudging a pin doesn't yank the user's manual pan/zoom back to "fit everything".
    const signature = [...farmers, ...buyers, ...donationFarmers].map((person) => person.id).sort().join(',');
    if (signature !== fittedSignatureRef.current) {
      fittedSignatureRef.current = signature;
      if (allPoints.length === 1) {
        map.setCenter(allPoints[0]);
        map.setZoom(12);
      } else if (allPoints.length > 1) {
        const bounds = new maps.LatLngBounds();
        allPoints.forEach((point) => bounds.extend(point));
        map.fitBounds(bounds, 40);
      } else {
        map.setCenter(CEBU_CENTER);
        map.setZoom(9);
      }
    }
  }, [isReady, farmers, buyers, donationFarmers, farmerCoordsById, buyerCoordsById, donationFarmerCoordsById, onSelectPin]);

  useEffect(() => {
    if (!selectedId) return;
    const marker = markersRef.current[selectedId];
    const map = mapRef.current;
    const maps = mapsRef.current;
    if (marker && map && maps) {
      map.panTo(marker.getPosition());
      map.setZoom(13);
      maps.event.trigger(marker, 'click');
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
