import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CheckCircle2,
  Clock3,
  Gauge,
  MapPin,
  Navigation,
  Package,
  Truck,
  X,
} from 'lucide-react';
import { DARK_MAP_STYLE, loadGoogleMaps } from '../../lib/googleMapsLoader';
import { MAP_COLORS } from '../../lib/mapMarkerColors';
import { haversineKm, resolveRoutePoints } from '../../utils/geo';
import { distanceToPolylineKm } from '../../services/routingService';
import { fetchGoogleRoute } from '../../services/googleDirectionsService';
import { advanceDelivery, getLiveTransitProgress, getNextDeliveryStatus } from '../../services/orderService';
import { useOrderTrackingSocket } from '../../hooks/useOrderTrackingSocket';
import { useSocketLocationSharing } from '../../hooks/useSocketLocationSharing';
import { useTheme } from '../../contexts/ThemeContext';
import { formatRelativeTime, getInitials } from '../../utils/formatters';
import Button from '../common/Button';











const NEAR_DESTINATION_KM_THRESHOLD = 0.4;
const MARKER_ANIMATION_DURATION_MS = 1200;
const ROUTE_LINE_COLOR = '#1a73e8';



const ROUTE_REFRESH_MIN_INTERVAL_MS = 20000;
const ROUTE_REFRESH_MIN_MOVE_KM = 0.05;
const ROUTE_DEVIATION_KM = 0.08;

function buildPinIcon(mapsApi, color) {
  const svg = `<svg width="26" height="34" viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg">` +
    `<path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 20 12 20s12-11 12-20C24 5.373 18.627 0 12 0z" fill="${color}"/>` +
    `<circle cx="12" cy="12" r="5" fill="white"/></svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new mapsApi.Size(26, 34),
    anchor: new mapsApi.Point(13, 34),
  };
}

function buildTruckIcon(mapsApi) {
  const svg = `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">` +
    `<circle cx="16" cy="16" r="15" fill="white" stroke="#16a34a" stroke-width="2.5"/>` +
    `<text x="16" y="22" font-size="16" text-anchor="middle">🚚</text></svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new mapsApi.Size(32, 32),
    anchor: new mapsApi.Point(16, 16),
  };
}

function animateMarkerTo(entry, targetPosition, durationMs = MARKER_ANIMATION_DURATION_MS) {
  if (entry.animationFrameId != null) cancelAnimationFrame(entry.animationFrameId);
  const startPosition = entry.marker.getPosition();
  const start = startPosition ? { lat: startPosition.lat(), lng: startPosition.lng() } : targetPosition;
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

export default function LiveTrackingModal({ order, isFarmer, onClose, onOrderUpdate }) {
  const containerRef = useRef(null);
  const modalRef = useRef(null);
  const closeButtonRef = useRef(null);
  const mapRef = useRef(null);
  const mapsApiRef = useRef(null);
  const layerRef = useRef([]);
  const truckEntryRef = useRef(null);
  const routeMetaRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const [googleRoute, setGoogleRoute] = useState(null);
  const [actionError, setActionError] = useState('');
  const [farmerMarkedComplete, setFarmerMarkedComplete] = useState(false);
  const { effectiveTheme } = useTheme();
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const { livePosition, connectionStatus } = useOrderTrackingSocket(order.id);
  const { isSharing, error: shareError, start: startSharing, stop: stopSharing } = useSocketLocationSharing(order.id);

  const transit = getLiveTransitProgress(order);
  const { origin, destination, isPickup } = resolveRoutePoints({
    id: order.id,
    originMunicipality: order.originMunicipality,
    destinationMunicipality: order.deliveryMunicipality,
    deliveryMethod: order.deliveryMethod,
  });




  const currentPosition = livePosition || transit.currentPosition;
  const remainingKm = currentPosition ? haversineKm(currentPosition, destination) : null;
  const averageSpeedKmh = googleRoute?.distanceKm && googleRoute?.durationMinutes
    ? googleRoute.distanceKm / (googleRoute.durationMinutes / 60)
    : transit.averageSpeedKmh;
  const etaMinutes = remainingKm != null && averageSpeedKmh
    ? Math.max(0, Math.ceil((remainingKm / averageSpeedKmh) * 60))
    : transit.etaMinutes;
  const isNearDestination = remainingKm != null ? remainingKm <= NEAR_DESTINATION_KM_THRESHOLD : transit.isNearDestination;
  const nextStep = getNextDeliveryStatus(order);
  const isDelivered = order.status === 'completed';
  const isOutForDelivery = transit.isInTransit || order.deliveryStatus === 'out_for_delivery';
  const statusLabel = isDelivered
    ? 'Delivered'
    : isOutForDelivery
      ? (isNearDestination ? 'Arriving soon' : 'On the way')
      : ['packed', 'ready_for_pickup'].includes(order.deliveryStatus)
        ? 'Ready for delivery'
        : 'Preparing';
  const statusClass = isDelivered || isOutForDelivery ? 'is-progress' : 'is-pending';






  const tripDistanceKm = googleRoute?.distanceKm ?? haversineKm(origin, destination);
  const tripElapsedMinutes = order.transitStartedAt && order.updatedAt
    ? (new Date(order.updatedAt).getTime() - new Date(order.transitStartedAt).getTime()) / 60000
    : null;


  const completedAverageSpeedKmh = tripElapsedMinutes != null && tripElapsedMinutes >= 0.5
    ? tripDistanceKm / (tripElapsedMinutes / 60)
    : null;

  const activeSpeedKmh = livePosition?.speed ?? transit.currentPosition?.speed ?? averageSpeedKmh;
  const etaValue = etaMinutes != null ? `${etaMinutes} min${etaMinutes === 1 ? '' : 's'}` : '—';
  const distanceValue = isDelivered ? '0.0 km' : (remainingKm != null ? `${remainingKm.toFixed(1)} km` : '—');
  const speedValue = isDelivered
    ? (completedAverageSpeedKmh != null ? `${completedAverageSpeedKmh.toFixed(0)} km/h` : '—')
    : (activeSpeedKmh != null && isOutForDelivery ? `${activeSpeedKmh.toFixed(0)} km/h` : '—');
  const lastLocationUpdatedAt = livePosition?.locationUpdatedAt || order.locationUpdatedAt;
  const mapConnectionLabel = connectionStatus === 'connected'
    ? 'Live'
    : lastLocationUpdatedAt
      ? `Last location received · ${formatRelativeTime(lastLocationUpdatedAt)}`
      : connectionStatus === 'connecting'
        ? 'Connecting…'
        : 'Waiting for connection';

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    closeButtonRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !modalRef.current) return;

      const focusableElements = modalRef.current.querySelectorAll(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      if (!firstElement || !lastElement) return;
      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, []);



  useEffect(() => {
    if (!transit.isInTransit) stopSharing();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transit.isInTransit]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined;
    let cancelled = false;
    loadGoogleMaps().then((mapsApi) => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      const map = new mapsApi.Map(containerRef.current, {
        center: origin,
        zoom: 12,
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: 'greedy',
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
    if (!currentPosition || isPickup) return undefined;
    let cancelled = false;
    const meta = routeMetaRef.current;
    const now = Date.now();

    const shouldFetch = !meta || (
      distanceToPolylineKm(currentPosition, meta.points) > ROUTE_DEVIATION_KM
        ? now - meta.fetchedAt > 8000
        : now - meta.fetchedAt > ROUTE_REFRESH_MIN_INTERVAL_MS && haversineKm(meta.fetchedFrom, currentPosition) > ROUTE_REFRESH_MIN_MOVE_KM
    );
    if (!shouldFetch) return undefined;

    fetchGoogleRoute(currentPosition, destination).then((result) => {
      if (cancelled || !result) return;
      routeMetaRef.current = { fetchedAt: Date.now(), fetchedFrom: currentPosition, points: result.points };
      setGoogleRoute(result);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPosition?.lat, currentPosition?.lng, isPickup]);



  useEffect(() => {
    const map = mapRef.current;
    const mapsApi = mapsApiRef.current;
    if (!mapReady || !map || !mapsApi) return;

    layerRef.current.forEach((layer) => layer.setMap(null));
    layerRef.current = [];

    const originMarker = new mapsApi.Marker({ position: origin, map, icon: buildPinIcon(mapsApi, MAP_COLORS.origin), title: order.farmerName });
    const destinationMarker = new mapsApi.Marker({ position: destination, map, icon: buildPinIcon(mapsApi, MAP_COLORS.destination), title: order.buyerName });
    layerRef.current.push(originMarker, destinationMarker);

    const pathPoints = googleRoute?.points?.length > 1
      ? googleRoute.points
      : currentPosition
        ? [currentPosition, destination]
        : [origin, destination];

    const casing = new mapsApi.Polyline({ path: pathPoints, strokeColor: '#ffffff', strokeWeight: 8, strokeOpacity: 0.9, map });
    const routeLine = new mapsApi.Polyline({ path: pathPoints, strokeColor: ROUTE_LINE_COLOR, strokeWeight: 5, strokeOpacity: 0.95, map });
    layerRef.current.push(casing, routeLine);

    if (currentPosition && !isPickup) {
      if (!truckEntryRef.current) {
        const marker = new mapsApi.Marker({ position: currentPosition, map, icon: buildTruckIcon(mapsApi) });
        truckEntryRef.current = { marker, animationFrameId: null };
      } else {
        truckEntryRef.current.marker.setMap(map);
        animateMarkerTo(truckEntryRef.current, currentPosition);
      }
    }

    const bounds = new mapsApi.LatLngBounds();
    bounds.extend(origin);
    bounds.extend(destination);
    if (currentPosition) bounds.extend(currentPosition);
    map.fitBounds(bounds, 48);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, googleRoute, currentPosition?.lat, currentPosition?.lng]);

  useEffect(() => {
    return () => {
      if (truckEntryRef.current?.animationFrameId != null) cancelAnimationFrame(truckEntryRef.current.animationFrameId);
    };
  }, []);

  const handleStartDelivery = async () => {
    setActionError('');
    try {
      const updated = await advanceDelivery(order.id);
      onOrderUpdate?.(updated);
      await startSharing();
    } catch (error) {
      setActionError(error.message);
    }
  };

  const handleCompleteDelivery = () => {
    stopSharing();
    setFarmerMarkedComplete(true);
  };

  const gpsAccuracyM = livePosition?.accuracy != null ? Math.round(livePosition.accuracy) : null;

  return (
    <AnimatePresence>
      <motion.div
        className="tracking-modal-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <motion.div
          ref={modalRef}
          className="tracking-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tracking-modal-title"
          aria-describedby="tracking-modal-subtitle"
          tabIndex={-1}
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.98 }}
          transition={{ type: 'spring', damping: 26, stiffness: 300 }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="tracking-modal-header">
            <div>
              <h2 id="tracking-modal-title">Delivery Tracking</h2>
              <p id="tracking-modal-subtitle" className="tracking-modal-subtitle">
                Live order tracking <span>·</span> Order #{order.id.slice(0, 8).toUpperCase()}
              </p>
            </div>
            <button ref={closeButtonRef} type="button" className="tracking-modal-close" onClick={onClose} aria-label="Close delivery tracking">
              <X size={18} />
            </button>
          </div>

          <section className="tracking-people-status" aria-label="People and delivery status">
            <div className="tracking-status-summary">
              <span className="tracking-summary-label">Delivery status</span>
              <span className={`tracking-status-pill ${statusClass}`}>
                {isDelivered ? <CheckCircle2 size={18} aria-hidden="true" /> : <Truck size={18} aria-hidden="true" />}
                {statusLabel}
              </span>
            </div>
            <div className="tracking-person">
              <span className="tracking-person-role">Farmer</span>
              <span className="tracking-person-avatar" aria-hidden="true">
                {order.farmerAvatarUrl
                  ? <img src={order.farmerAvatarUrl} alt="" />
                  : getInitials(order.farmerName)}
              </span>
              <span className="tracking-person-name">{order.farmerName}</span>
            </div>
            <div className="tracking-person">
              <span className="tracking-person-role">Buyer</span>
              <span className="tracking-person-avatar" aria-hidden="true">
                {order.buyerAvatarUrl
                  ? <img src={order.buyerAvatarUrl} alt="" />
                  : getInitials(order.buyerName)}
              </span>
              <span className="tracking-person-name">{order.buyerName}</span>
            </div>
          </section>

          <section className="tracking-map-section" aria-labelledby="tracking-route-title">
            <div className="tracking-map-heading">
              <h3 id="tracking-route-title">Delivery Route</h3>
              <span className={`tracking-live-state ${connectionStatus === 'connected' ? 'is-live' : ''}`}>
                <span aria-hidden="true" />
                {mapConnectionLabel}
              </span>
            </div>
            <ul className="tracking-map-legend" aria-label="Map markers">
              <li><span className="is-origin" aria-hidden="true" />Farmer / origin</li>
              <li><span className="is-destination" aria-hidden="true" />Buyer / destination</li>
              {currentPosition && !isPickup ? <li><span className="is-driver" aria-hidden="true" />Driver</li> : null}
              <li><span className="is-route" aria-hidden="true" />Route</li>
            </ul>
            <div
              ref={containerRef}
              className="tracking-modal-map"
              role="region"
              aria-label="Map showing the delivery route"
            />
          </section>

          {!isPickup ? (
            <div className="tracking-gps-details">
              <span>GPS accuracy</span>
              <strong>{gpsAccuracyM != null ? `±${gpsAccuracyM} m` : '—'}</strong>
              {lastLocationUpdatedAt ? <span>Updated {formatRelativeTime(lastLocationUpdatedAt)}</span> : null}
            </div>
          ) : null}

          {isDelivered ? (
            <section className="tracking-delivery-summary is-complete" aria-label="Delivery completion summary">
              <div className="tracking-completion-message">
                <CheckCircle2 size={20} aria-hidden="true" />
                <div>
                  <strong>Completed successfully</strong>
                  <span>Your order has reached its destination.</span>
                </div>
              </div>
              <div className="tracking-summary-stat">
                <span><MapPin size={16} aria-hidden="true" />Distance remaining</span>
                <strong>{distanceValue}</strong>
              </div>
              <div className="tracking-summary-stat">
                <span><Gauge size={16} aria-hidden="true" />Average speed</span>
                <strong>{speedValue}</strong>
              </div>
            </section>
          ) : (
            <section className="tracking-delivery-summary" aria-label="Delivery summary">
              <div className="tracking-summary-stat">
                <span><Clock3 size={16} aria-hidden="true" />Estimated arrival</span>
                <strong>{etaValue}</strong>
              </div>
              <div className="tracking-summary-stat">
                <span><MapPin size={16} aria-hidden="true" />Distance remaining</span>
                <strong>{distanceValue}</strong>
              </div>
              <div className="tracking-summary-stat">
                <span><Gauge size={16} aria-hidden="true" />Current speed</span>
                <strong>{speedValue}</strong>
              </div>
            </section>
          )}

          {farmerMarkedComplete && order.status !== 'completed' ? (
            <p className="tracking-pending-confirmation">
              Delivery marked complete. Waiting for {order.buyerName} to confirm receipt.
            </p>
          ) : null}

          {actionError ? <div className="form-alert error">{actionError}</div> : null}
          {shareError ? <div className="form-alert error">{shareError}</div> : null}

          {isFarmer && !isPickup ? (
            <div className="tracking-farmer-actions">
              {nextStep === 'out_for_delivery' ? (
                <Button onClick={handleStartDelivery}>
                  <Navigation size={15} /> Start Delivery
                </Button>
              ) : null}
              {transit.isInTransit && !farmerMarkedComplete ? (
                <Button variant="secondary" onClick={handleCompleteDelivery}>
                  <Package size={15} /> Complete Delivery
                </Button>
              ) : null}
              {transit.isInTransit ? (
                <span className="muted">{isSharing ? 'Sharing your live location…' : 'Not sharing your location yet.'}</span>
              ) : null}
            </div>
          ) : null}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
