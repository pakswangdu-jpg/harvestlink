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
  User,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { loadGoogleMaps } from '../../lib/googleMapsLoader';
import { haversineKm, resolveRoutePoints } from '../../utils/geo';
import { distanceToPolylineKm } from '../../services/routingService';
import { fetchGoogleRoute } from '../../services/googleDirectionsService';
import { advanceDelivery, getLiveTransitProgress, getNextDeliveryStatus } from '../../services/orderService';
import { useOrderTrackingSocket } from '../../hooks/useOrderTrackingSocket';
import { useSocketLocationSharing } from '../../hooks/useSocketLocationSharing';
import { formatRelativeTime } from '../../utils/formatters';
import Button from '../common/Button';

// This modal is the Grab/Uber-Eats/Lalamove-style live tracking experience — a new,
// self-contained addition alongside the already-working delivery map/ETA on
// OrderTracking.jsx (untouched). It intentionally shares no code with DeliveryMap.jsx so
// nothing here can ever regress that component: its own map instance, its own marker
// animation, its own Google Directions-based route line (see googleDirectionsService.js),
// fed by the new Socket.IO broadcast layer (see backend/src/realtime/orderTracking.js) for
// sub-second position pushes instead of the 4s poll the rest of the app uses.

// "Near destination" for this view specifically — tighter than the generic 1km used
// elsewhere (see orderService.js), matching this feature's ~300-500m ask.
const NEAR_DESTINATION_KM_THRESHOLD = 0.4;
const MARKER_ANIMATION_DURATION_MS = 1200;
const ROUTE_LINE_COLOR = '#1a73e8';
// Throttle for re-fetching the Google Directions route as the farmer moves — Directions is
// a billed API, so this deliberately doesn't call it on every single 3-5s GPS tick (same
// discipline already applied to the OSRM caller in DeliveryMap.jsx).
const ROUTE_REFRESH_MIN_INTERVAL_MS = 20000;
const ROUTE_REFRESH_MIN_MOVE_KM = 0.05;
const ROUTE_DEVIATION_KM = 0.08;

const TIMELINE_STAGES = [
  { key: 'confirmed', label: 'Order Confirmed', emoji: '✔️' },
  { key: 'preparing', label: 'Farmer Preparing', emoji: '🚜' },
  { key: 'on-the-way', label: 'On the Way', emoji: '🚚' },
  { key: 'near-destination', label: 'Near Destination', emoji: '📍' },
  { key: 'delivered', label: 'Delivered', emoji: '✅' },
];

function getTimelineStageIndex(order, isInTransit, isNearDestination) {
  if (order.status === 'completed') return 4;
  if (isInTransit) return isNearDestination ? 3 : 2;
  if (['preparing', 'packed'].includes(order.deliveryStatus)) return 1;
  return 0;
}

const STATUS_BADGE_STYLES = {
  confirmed: { bg: '#dbeafe', fg: '#1d4ed8', label: 'Confirmed' },
  preparing: { bg: '#fef3c7', fg: '#92400e', label: 'Farmer Preparing' },
  'on-the-way': { bg: '#ffedd5', fg: '#c2410c', label: 'On the Way' },
  'near-destination': { bg: '#f3e8ff', fg: '#7e22ce', label: 'Near Destination' },
  delivered: { bg: '#dcfce7', fg: '#166534', label: 'Delivered' },
};

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
  const mapRef = useRef(null);
  const mapsApiRef = useRef(null);
  const layerRef = useRef([]);
  const truckEntryRef = useRef(null);
  const routeMetaRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const [googleRoute, setGoogleRoute] = useState(null);
  const [actionError, setActionError] = useState('');
  const [farmerMarkedComplete, setFarmerMarkedComplete] = useState(false);

  const { livePosition, connectionStatus } = useOrderTrackingSocket(order.id);
  const { isSharing, error: shareError, start: startSharing, stop: stopSharing } = useSocketLocationSharing(order.id);

  const transit = getLiveTransitProgress(order);
  const { origin, destination, isPickup } = resolveRoutePoints({
    id: order.id,
    originMunicipality: order.originMunicipality,
    destinationMunicipality: order.deliveryMunicipality,
    deliveryMethod: order.deliveryMethod,
  });

  // The socket delivers a fresher fix than `order` itself (which only updates on the 4s
  // poll/Realtime tick) — preferring it here is what makes distance/ETA feel instant rather
  // than capped at that poll cadence.
  const currentPosition = livePosition || transit.currentPosition;
  const remainingKm = currentPosition ? haversineKm(currentPosition, destination) : null;
  const averageSpeedKmh = googleRoute?.distanceKm && googleRoute?.durationMinutes
    ? googleRoute.distanceKm / (googleRoute.durationMinutes / 60)
    : transit.averageSpeedKmh;
  const etaMinutes = remainingKm != null && averageSpeedKmh
    ? Math.max(0, Math.ceil((remainingKm / averageSpeedKmh) * 60))
    : transit.etaMinutes;
  const isNearDestination = remainingKm != null ? remainingKm <= NEAR_DESTINATION_KM_THRESHOLD : transit.isNearDestination;
  const stageIndex = getTimelineStageIndex(order, transit.isInTransit, isNearDestination);
  const badgeStyle = STATUS_BADGE_STYLES[TIMELINE_STAGES[stageIndex].key];
  const nextStep = getNextDeliveryStatus(order);
  const isDelivered = order.status === 'completed';

  // Once delivered, getLiveTransitProgress correctly stops returning live ETA/distance/speed
  // (there's no more live position to derive them from) — but showing blank dashes on a
  // "successfully delivered" screen looks broken, not finished. Show a real trip summary
  // instead: distance covered, and a genuine average speed computed from the actual elapsed
  // transit time (transitStartedAt -> updatedAt, both already on the order — no new data).
  const tripDistanceKm = googleRoute?.distanceKm ?? haversineKm(origin, destination);
  const tripElapsedMinutes = order.transitStartedAt && order.updatedAt
    ? (new Date(order.updatedAt).getTime() - new Date(order.transitStartedAt).getTime()) / 60000
    : null;
  // Below ~30s, elapsed time is too noisy to divide by — dividing a real trip distance by a
  // near-zero duration produces a nonsense speed rather than a merely imprecise one.
  const completedAverageSpeedKmh = tripElapsedMinutes != null && tripElapsedMinutes >= 0.5
    ? tripDistanceKm / (tripElapsedMinutes / 60)
    : null;

  const etaCardValue = isDelivered ? 'Delivered' : (etaMinutes != null ? `${etaMinutes} min${etaMinutes === 1 ? '' : 's'}` : '—');
  const distanceCardValue = isDelivered ? '0.0 km' : (remainingKm != null ? `${remainingKm.toFixed(1)} km` : '—');
  const speedCardValue = isDelivered
    ? (completedAverageSpeedKmh != null ? `${completedAverageSpeedKmh.toFixed(0)} km/h avg` : '—')
    : (averageSpeedKmh != null && transit.isInTransit ? `${averageSpeedKmh.toFixed(0)} km/h` : '—');

  // Stop sharing once there's nothing left to share for (order left "out for delivery") —
  // mirrors the same safeguard the REST-based hook already has on OrderTracking.jsx.
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

  // Fetches (and throttles refetching) the actual Google driving route once a live position
  // exists — see the ROUTE_REFRESH_* constants above for the cost-control reasoning.
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

  // Renders/updates markers + the blue route polyline every time the position or route data
  // changes — the truck marker is persisted (not recreated) so it can animate smoothly.
  useEffect(() => {
    const map = mapRef.current;
    const mapsApi = mapsApiRef.current;
    if (!mapReady || !map || !mapsApi) return;

    layerRef.current.forEach((layer) => layer.setMap(null));
    layerRef.current = [];

    const originMarker = new mapsApi.Marker({ position: origin, map, icon: buildPinIcon(mapsApi, '#15803d'), title: order.farmerName });
    const destinationMarker = new mapsApi.Marker({ position: destination, map, icon: buildPinIcon(mapsApi, '#1d4ed8'), title: order.buyerName });
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

  const connectionLabel = connectionStatus === 'connected' ? 'Live' : connectionStatus === 'connecting' ? 'Connecting…' : 'Reconnecting…';
  const gpsAccuracyM = livePosition?.accuracy != null ? Math.round(livePosition.accuracy) : null;

  return (
    <AnimatePresence>
      <motion.div
        className="tracking-modal-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="tracking-modal"
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.98 }}
          transition={{ type: 'spring', damping: 26, stiffness: 300 }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="tracking-modal-header">
            <div>
              <p className="eyebrow">Live Delivery Tracking</p>
              <h2>Order #{order.id.slice(0, 8).toUpperCase()}</h2>
            </div>
            <button type="button" className="tracking-modal-close" onClick={onClose} aria-label="Close">
              <X size={18} />
            </button>
          </div>

          {order.status === 'completed' || farmerMarkedComplete ? (
            <motion.div
              className="tracking-complete-banner"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              <CheckCircle2 size={28} />
              <div>
                <strong>{order.status === 'completed' ? 'Your order has been successfully delivered.' : 'Delivery marked complete.'}</strong>
                {order.status !== 'completed' ? (
                  <p>Waiting for {order.buyerName} to confirm they received it.</p>
                ) : null}
              </div>
            </motion.div>
          ) : null}

          <motion.div
            className="tracking-info-cards"
            initial="hidden"
            animate="show"
            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
          >
            {[
              { icon: <User size={18} />, label: 'Farmer', value: order.farmerName },
              { icon: <User size={18} />, label: 'Buyer', value: order.buyerName },
              {
                icon: <Truck size={18} />,
                label: 'Status',
                value: (
                  <span className="tracking-status-pill" style={{ background: badgeStyle.bg, color: badgeStyle.fg }}>
                    {TIMELINE_STAGES[stageIndex].emoji} {badgeStyle.label}
                  </span>
                ),
              },
              { icon: <Clock3 size={18} />, label: 'ETA', value: etaCardValue },
              { icon: <MapPin size={18} />, label: 'Remaining Distance', value: distanceCardValue },
              { icon: <Gauge size={18} />, label: 'Average Speed', value: speedCardValue },
            ].map((card) => (
              <motion.div
                key={card.label}
                className="tracking-info-card"
                variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
              >
                <div className="tracking-info-card-icon">{card.icon}</div>
                <div>
                  <p>{card.label}</p>
                  <strong>{card.value}</strong>
                </div>
              </motion.div>
            ))}
          </motion.div>

          <div className="tracking-timeline">
            {TIMELINE_STAGES.map((stage, index) => (
              <div key={stage.key} className={`tracking-timeline-step ${index < stageIndex ? 'done' : index === stageIndex ? 'active' : ''}`}>
                <motion.span
                  className="tracking-timeline-icon"
                  animate={index === stageIndex ? { scale: [1, 1.15, 1] } : {}}
                  transition={{ repeat: index === stageIndex ? Infinity : 0, duration: 1.6 }}
                >
                  {stage.emoji}
                </motion.span>
                <span>{stage.label}</span>
              </div>
            ))}
          </div>

          <div ref={containerRef} className="tracking-modal-map" />

          {!isPickup ? (
            <div className="tracking-gps-card">
              <div>
                <span>Last GPS update</span>
                <strong>{order.locationUpdatedAt ? formatRelativeTime(order.locationUpdatedAt) : 'Not shared yet'}</strong>
              </div>
              <div>
                <span>GPS accuracy</span>
                <strong>{gpsAccuracyM != null ? `±${gpsAccuracyM} m` : '—'}</strong>
              </div>
              <div>
                <span>Connection</span>
                <strong className="tracking-connection-status">
                  {connectionStatus === 'connected' ? <Wifi size={14} /> : <WifiOff size={14} />} {connectionLabel}
                </strong>
              </div>
            </div>
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
