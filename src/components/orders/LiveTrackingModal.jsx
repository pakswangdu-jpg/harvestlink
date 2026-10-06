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
import {
  getRegisteredCoordinates,
} from '../../utils/geo';
import { useTrafficNavigation } from '../../hooks/useTrafficNavigation';
import { getRecordedAverageSpeedKmh } from '../../utils/tripTelemetry';
import TrafficRouteNotice from './TrafficRouteNotice';
import { advanceDelivery, getLiveTransitProgress, getNextDeliveryStatus } from '../../services/orderService';
import { getUserById } from '../../services/authService';
import { useOrderTrackingSocket } from '../../hooks/useOrderTrackingSocket';
import { useTheme } from '../../contexts/ThemeContext';
import { formatRelativeTime, getInitials } from '../../utils/formatters';
import deliveryTruckIcon from '../../assets/icons/delivery-truck.png';
import deliveryVanIcon from '../../assets/icons/harvestlink-delivery-van.png?inline';
import {
  buildVehicleMarkerSvg,
  getContinuousVehicleHeading,
  requestDeviceOrientationPermission,
  resolveVehicleHeading,
  VEHICLE_MARKER_HEIGHT_PX,
  VEHICLE_MARKER_WIDTH_PX,
} from '../../utils/vehicleMarker';
import Button from '../common/Button';
import StartDeliveryDialog from './StartDeliveryDialog';











const NEAR_DESTINATION_KM_THRESHOLD = 0.4;
const MARKER_ANIMATION_DURATION_MS = 1200;
const ROUTE_LINE_COLOR = '#1a73e8';



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

function buildTruckIcon(mapsApi, heading, previousHeading) {
  const svg = buildVehicleMarkerSvg(deliveryVanIcon, heading, previousHeading);
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new mapsApi.Size(VEHICLE_MARKER_WIDTH_PX, VEHICLE_MARKER_HEIGHT_PX),
    anchor: new mapsApi.Point(VEHICLE_MARKER_WIDTH_PX / 2, VEHICLE_MARKER_HEIGHT_PX / 2),
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
  const vehicleHeadingRef = useRef(0);
  const lastVehicleHeadingPositionRef = useRef(null);
  const trafficLayerRef = useRef(null);
  const [trafficEnabled, setTrafficEnabled] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [actionError, setActionError] = useState('');
  const [profileLoad, setProfileLoad] = useState(null);
  const [farmerMarkedComplete, setFarmerMarkedComplete] = useState(false);
  const [isStartDeliveryDialogOpen, setIsStartDeliveryDialogOpen] = useState(false);
  const { effectiveTheme } = useTheme();
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const { livePosition, connectionStatus } = useOrderTrackingSocket(order.id, order);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getUserById(order.farmerId), getUserById(order.buyerId)])
      .then(([farmer, buyer]) => {
        if (cancelled) return;
        setProfileLoad({
          farmerId: order.farmerId,
          buyerId: order.buyerId,
          farmer,
          buyer,
          error: !getRegisteredCoordinates(farmer) || !getRegisteredCoordinates(buyer)
            ? 'Saved Farmer and Buyer profile coordinates are required for delivery tracking.'
            : '',
        });
      })
      .catch((error) => {
        if (cancelled) return;
        setProfileLoad({
          farmerId: order.farmerId,
          buyerId: order.buyerId,
          error: error.message || 'Could not load the saved delivery locations.',
        });
      });
    return () => {
      cancelled = true;
    };
  }, [order.farmerId, order.buyerId]);

  const hasLoadedProfiles = profileLoad?.farmerId === order.farmerId
    && profileLoad?.buyerId === order.buyerId;
  const farmerProfile = hasLoadedProfiles ? profileLoad.farmer : null;
  const buyerProfile = hasLoadedProfiles ? profileLoad.buyer : null;
  const profileLocationError = hasLoadedProfiles ? profileLoad.error : '';
  const origin = getRegisteredCoordinates(farmerProfile);
  const destination = getRegisteredCoordinates(buyerProfile);
  const isPickup = order.deliveryMethod === 'buyer_pickup';
  const transit = getLiveTransitProgress(order, { origin, destination });
  const isSharing = transit.isInTransit;
  const currentPosition = livePosition;
  const profileStartPosition = !isPickup && !['completed', 'cancelled'].includes(order.status) ? origin : null;
  const vehiclePosition = currentPosition || profileStartPosition;
  const navigation = useTrafficNavigation({
    orderId: order.id,
    origin: isPickup ? destination : origin,
    destination: isPickup ? origin : destination,
    position: currentPosition,
    locationUpdatedAt: currentPosition?.locationUpdatedAt,
    active: transit.isInTransit && !isPickup,
  });
  const googleRoute = navigation.selected;
  const remainingKm = !navigation.stale ? googleRoute?.distanceKm ?? null : null;
  const etaMinutes = !navigation.stale && googleRoute?.durationMinutes != null
    ? Math.max(0, Math.ceil(googleRoute.durationMinutes)) : null;
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






  const completedAverageSpeedKmh = getRecordedAverageSpeedKmh(order);

  const gpsSpeed = currentPosition?.speed;
  const activeSpeedKmh = Number.isFinite(gpsSpeed) ? Math.max(0, gpsSpeed * 3.6) : null;
  const etaValue = etaMinutes != null ? `${etaMinutes} min${etaMinutes === 1 ? '' : 's'}` : '—';
  const distanceValue = isDelivered ? '0.0 km' : (remainingKm != null ? `${remainingKm.toFixed(1)} km` : '—');
  const speedValue = isDelivered
    ? (completedAverageSpeedKmh != null ? `${completedAverageSpeedKmh.toFixed(1)} km/h` : '—')
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
    if (!containerRef.current || mapRef.current || !origin || !destination) return undefined;
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
      if (typeof mapsApi.TrafficLayer === 'function') trafficLayerRef.current = new mapsApi.TrafficLayer();
      setMapReady(true);
    });
    return () => {
      cancelled = true;
    };
    // Profile coordinates are intentionally the only map initialization trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin?.lat, origin?.lng, destination?.lat, destination?.lng, effectiveTheme]);




  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    mapRef.current.setOptions({ styles: effectiveTheme === 'dark' ? DARK_MAP_STYLE : [] });
  }, [effectiveTheme, mapReady]);



  useEffect(() => {
    if (!mapReady || !trafficLayerRef.current) return;
    trafficLayerRef.current.setMap(trafficEnabled && transit.isInTransit ? mapRef.current : null);
  }, [mapReady, trafficEnabled, transit.isInTransit]);

  useEffect(() => () => trafficLayerRef.current?.setMap(null), []);

  useEffect(() => {
    const map = mapRef.current;
    const mapsApi = mapsApiRef.current;
    if (!mapReady || !map || !mapsApi || !origin || !destination) return;

    layerRef.current.forEach((layer) => layer.setMap(null));
    layerRef.current = [];

    const originMarker = new mapsApi.Marker({ position: origin, map, icon: buildPinIcon(mapsApi, MAP_COLORS.origin), title: order.farmerName });
    const destinationMarker = new mapsApi.Marker({ position: destination, map, icon: buildPinIcon(mapsApi, MAP_COLORS.destination), title: order.buyerName });
    layerRef.current.push(originMarker, destinationMarker);

    const pathPoints = googleRoute?.points || [];
    (navigation.alternatives || []).forEach((route) => {
      const line = new mapsApi.Polyline({ path: route.points, strokeColor: '#9aa0a6', strokeWeight: 4, strokeOpacity: 0.7, map, zIndex: 1 });
      layerRef.current.push(line);
    });

    const casing = new mapsApi.Polyline({ path: pathPoints, strokeColor: '#ffffff', strokeWeight: 8, strokeOpacity: 0.9, map, zIndex: 2 });
    const routeLine = new mapsApi.Polyline({ path: pathPoints, strokeColor: ROUTE_LINE_COLOR, strokeWeight: 5, strokeOpacity: 0.95, map, zIndex: 3 });
    layerRef.current.push(casing, routeLine);

    if (vehiclePosition && !isPickup) {
      const previousHeading = vehicleHeadingRef.current;
      const resolvedHeading = resolveVehicleHeading({
        previousPosition: lastVehicleHeadingPositionRef.current,
        currentPosition: vehiclePosition,
        lastHeading: vehicleHeadingRef.current,
        deviceHeading: vehiclePosition.deviceHeading,
        gpsHeading: vehiclePosition.heading,
      });
      vehicleHeadingRef.current = resolvedHeading.heading;
      if (resolvedHeading.shouldUpdateReference) lastVehicleHeadingPositionRef.current = vehiclePosition;
      const renderedHeading = getContinuousVehicleHeading(previousHeading, resolvedHeading.heading);

      if (!truckEntryRef.current) {
        const marker = new mapsApi.Marker({
          position: vehiclePosition,
          map,
          icon: buildTruckIcon(mapsApi, vehicleHeadingRef.current),
        });
        truckEntryRef.current = { marker, animationFrameId: null };
      } else {
        truckEntryRef.current.marker.setMap(map);
        truckEntryRef.current.marker.setIcon(buildTruckIcon(mapsApi, renderedHeading, previousHeading));
        animateMarkerTo(truckEntryRef.current, vehiclePosition);
      }
    }

    const bounds = new mapsApi.LatLngBounds();
    bounds.extend(origin);
    bounds.extend(destination);
    if (vehiclePosition) bounds.extend(vehiclePosition);
    map.fitBounds(bounds, 48);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, googleRoute, navigation.alternatives, currentPosition?.lat, currentPosition?.lng, vehiclePosition?.lat, vehiclePosition?.lng, origin?.lat, origin?.lng, destination?.lat, destination?.lng, isPickup]);

  useEffect(() => {
    const map = mapRef.current;
    const mapsApi = mapsApiRef.current;
    if (!mapReady || !map || !mapsApi || !vehiclePosition || isPickup || !truckEntryRef.current) return;

    const previousHeading = vehicleHeadingRef.current;
    const resolvedHeading = resolveVehicleHeading({
      previousPosition: lastVehicleHeadingPositionRef.current,
      currentPosition: vehiclePosition,
      lastHeading: previousHeading,
      deviceHeading: vehiclePosition.deviceHeading,
      gpsHeading: vehiclePosition.heading,
    });
    vehicleHeadingRef.current = resolvedHeading.heading;
    if (resolvedHeading.shouldUpdateReference) lastVehicleHeadingPositionRef.current = vehiclePosition;
    const renderedHeading = getContinuousVehicleHeading(previousHeading, resolvedHeading.heading);
    if (renderedHeading === previousHeading) return;
    truckEntryRef.current.marker.setIcon(buildTruckIcon(
      mapsApi,
      renderedHeading,
      previousHeading,
    ));
  }, [mapReady, vehiclePosition, vehiclePosition?.heading, vehiclePosition?.deviceHeading, isPickup]);

  useEffect(() => {
    return () => {
      if (truckEntryRef.current?.animationFrameId != null) cancelAnimationFrame(truckEntryRef.current.animationFrameId);
    };
  }, []);

  const handleStartDelivery = async (plateNumber) => {
    setIsStartDeliveryDialogOpen(false);
    setActionError('');
    await requestDeviceOrientationPermission();
    try {
      const updated = await advanceDelivery(order.id, plateNumber);
      onOrderUpdate?.(updated);
    } catch (error) {
      setActionError(error.message);
    }
  };

  const handleCompleteDelivery = () => {
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

          {order.deliveryMethod === 'farmer_delivery' && order.vehiclePlateNumber ? (
            <div className="tracking-vehicle-plate" aria-label={`Vehicle plate ${order.vehiclePlateNumber}`}>
              <span><img src={deliveryTruckIcon} alt="" aria-hidden="true" />Vehicle plate</span>
              <strong>{order.vehiclePlateNumber}</strong>
            </div>
          ) : null}

          <section className="tracking-map-section" aria-labelledby="tracking-route-title">
            <div className="tracking-map-heading">
              <h3 id="tracking-route-title">Delivery Route</h3>
              <span className={`tracking-live-state ${connectionStatus === 'connected' ? 'is-live' : ''}`}>
                <span aria-hidden="true" />
                {mapConnectionLabel}
              </span>
            </div>
            {transit.isInTransit && mapReady ? (
              <button type="button" className="btn btn-secondary btn-sm" aria-pressed={trafficEnabled} onClick={() => setTrafficEnabled((value) => !value)}>
                Google traffic {trafficEnabled ? 'on' : 'off'}
              </button>
            ) : null}
            <TrafficRouteNotice navigation={navigation} allowChoice={isFarmer && transit.isInTransit && !isPickup} />
            <ul className="tracking-map-legend" aria-label="Map markers">
              <li><span className="is-origin" aria-hidden="true" />Farmer / origin</li>
              <li><span className="is-destination" aria-hidden="true" />Buyer / destination</li>
              {vehiclePosition && !isPickup ? <li><span className="is-driver" aria-hidden="true" />Driver</li> : null}
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
            <section className="tracking-completed-summary" aria-label="Completed delivery summary">
              <div className="tracking-completed-state">
                <CheckCircle2 size={20} aria-hidden="true" />
                <div>
                  <strong>{statusLabel}</strong>
                  <p>Order completed successfully</p>
                </div>
              </div>
              {completedAverageSpeedKmh != null ? (
                <dl className="tracking-completed-metrics">
                  <div><dt>Average speed</dt><dd>{speedValue}</dd></div>
                </dl>
              ) : null}
            </section>
          ) : (
            <section className="tracking-delivery-summary" aria-label="Live delivery summary">
              <div className="tracking-summary-stat">
                <span><Clock3 size={16} aria-hidden="true" />ETA</span>
                <strong>{etaValue}</strong>
              </div>
              <div className="tracking-summary-stat">
                <span><MapPin size={16} aria-hidden="true" />Remaining Distance</span>
                <strong>{distanceValue}</strong>
              </div>
              <div className="tracking-summary-stat">
                <span><Gauge size={16} aria-hidden="true" />{isDelivered ? 'Average Speed' : 'Current Speed'}</span>
                <strong>{speedValue}</strong>
              </div>
              <div className="tracking-summary-stat">
                <span><Truck size={16} aria-hidden="true" />Delivery Status</span>
                <strong>{statusLabel}</strong>
              </div>
            </section>
          )}

          {farmerMarkedComplete && order.status !== 'completed' ? (
            <p className="tracking-pending-confirmation">
              Delivery marked complete. Waiting for {order.buyerName} to confirm receipt.
            </p>
          ) : null}

          {actionError || profileLocationError
            ? <div className="form-alert error">{actionError || profileLocationError}</div>
            : null}
          {isFarmer && !isPickup ? (
            <div className="tracking-farmer-actions">
              {nextStep === 'out_for_delivery' ? (
                <Button onClick={() => setIsStartDeliveryDialogOpen(true)}>
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
      <StartDeliveryDialog
        open={isStartDeliveryDialogOpen}
        onConfirm={handleStartDelivery}
        onCancel={() => setIsStartDeliveryDialogOpen(false)}
      />
    </AnimatePresence>
  );
}
