import { useEffect, useState } from 'react';
import { Check, Clock3, Gauge, MapPin, Navigation, Truck, User, X } from 'lucide-react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import AppShell from '../../components/layout/AppShell';
import Button from '../../components/common/Button';
import StarRating from '../../components/common/StarRating';
import StatCard from '../../components/cards/StatCard';
import OrderTracker from '../../components/orders/OrderTracker';
import LiveDeliveryMap from '../../components/orders/LiveDeliveryMap';
import { useAuth } from '../auth/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { getUserById } from '../../services/authService';
import { createRating, getRatingForOrder } from '../../services/ratingService';
import {
  advanceDelivery,
  cancelOrder,
  getDeliverySequence,
  getDeliveryTrackingStatus,
  getLiveTransitProgress,
  getNextDeliveryStatus,
  getOrderById,
  isCancellable,
  mapOrderRealtimeRow,
  payOrder,
  updateOrderStatus,
} from '../../services/orderService';
import { DELIVERY_STEP_LABELS, ONLINE_PAYMENT_METHODS } from '../../utils/constants';
import {
  deliveryMethodLabel,
  formatCurrency,
  formatDate,
  formatDurationMinutes,
  paymentLabel,
  shortOrderId,
} from '../../utils/formatters';
import { getNavItemsForRole } from '../../utils/navItemsByRole';

const TRACKING_STATUS_EMOJI = {
  pending: '⏳',
  confirmed: '✅',
  'on-the-way': '🚚',
  'near-destination': '📍',
  delivered: '✅',
  rejected: '✕',
  cancelled: '✕',
};

function fallbackOrdersPath(role) {
  if (role === 'farmer') return '/farmer-orders';
  if (role === 'stakeholder') return '/stakeholder-orders';
  return '/buyer-orders';
}

export default function OrderTracking() {
  const { id } = useParams();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [order, setOrder] = useState(null);
  const [loadedId, setLoadedId] = useState(null);
  const [pickupBuyerMunicipality, setPickupBuyerMunicipality] = useState(null);
  const [notice, setNotice] = useState(location.state?.notice || '');
  const [error, setError] = useState('');
  const [existingRating, setExistingRating] = useState(null);
  const [ratingValue, setRatingValue] = useState(0);
  const [ratingComment, setRatingComment] = useState('');
  const [isSubmittingRating, setIsSubmittingRating] = useState(false);
  const [ratingError, setRatingError] = useState('');

  useEffect(() => {
    let cancelled = false;
    let hasLoadedOnce = false;
    const refresh = () => {
      getOrderById(id)
        .then((result) => {
          if (cancelled) return;
          hasLoadedOnce = true;
          setOrder(result);
          setLoadedId(id);
        })
        .catch(() => {
          if (cancelled) return;
          // Only the very first load failing should redirect away (the order genuinely
          // doesn't exist / isn't accessible) — a later poll failing (e.g. a dropped network
          // connection) is transient and shouldn't evict the user from a page that already
          // loaded successfully; the next successful poll or the Realtime subscription below
          // resyncs it once connectivity returns.
          if (!hasLoadedOnce) {
            setOrder(null);
            setLoadedId(id);
          }
        });
    };
    refresh();
    const interval = setInterval(refresh, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [id]);

  // Supabase Realtime pushes location/status updates for this order the instant they happen
  // (see the orders_select_own RLS policy + supabase_realtime publication in schema.sql),
  // layered on top of the 4s poll above rather than replacing it — the poll stays as the
  // resilient baseline (survives a dropped realtime connection), while this gives the
  // near-instant "live" feel for the common case.
  useEffect(() => {
    const channel = supabase
      .channel(`order-tracking-${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${id}` }, (payload) => {
        setOrder(mapOrderRealtimeRow(payload.new));
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  // For a pickup order, the destination pin is where the BUYER starts from, not the farm
  // itself — the farmer viewing this page needs that buyer's municipality resolved
  // separately (the buyer viewing their own order already has it via currentUser). Only
  // relevant when isPickup && !isBuyer below, so a stale value from a previously-viewed
  // order sitting in state harmlessly goes unread the rest of the time.
  const needsPickupBuyerLookup = Boolean(order) && order.deliveryMethod === 'buyer_pickup' && currentUser.id !== order.buyerId;
  useEffect(() => {
    if (!needsPickupBuyerLookup) return undefined;
    let cancelled = false;
    getUserById(order.buyerId)
      .then((buyer) => {
        if (!cancelled) setPickupBuyerMunicipality(buyer?.municipality || null);
      })
      .catch(() => {
        if (!cancelled) setPickupBuyerMunicipality(null);
      });
    return () => {
      cancelled = true;
    };
  }, [needsPickupBuyerLookup, order?.buyerId]);

  // "Buyer" here means "the account that placed this order" — a partner organization
  // checking out through the marketplace is just as much the buyer as a buyer-role
  // account is, so this checks id ownership, not the literal account role.
  const isBuyer = Boolean(order) && currentUser.id === order.buyerId;
  const isFarmer = Boolean(order) && currentUser.role === 'farmer' && currentUser.id === order.farmerId;

  // Only relevant once the order is actually completed (the buyer clicked "Got it") — checks
  // whether this specific order already has a rating so the prompt doesn't show twice.
  const needsRatingCheck = isBuyer && order?.status === 'completed';
  useEffect(() => {
    if (!needsRatingCheck) return undefined;
    let cancelled = false;
    getRatingForOrder(order.id)
      .then((result) => {
        if (!cancelled) setExistingRating(result);
      })
      .catch(() => {
        // Fails open — if the check itself can't be made, showing the rating form (rather
        // than silently hiding it) is the safer default; a genuine duplicate submit is
        // still rejected server-side either way.
      });
    return () => {
      cancelled = true;
    };
  }, [needsRatingCheck, order?.id]);

  const transit = order ? getLiveTransitProgress(order) : null;
  const { etaMinutes = null, estimatedTotalMinutes = null, isInTransit = false, isLiveGps = false } = transit || {};

  // GPS sharing itself is handled globally (see useFarmerActiveDeliverySharing, mounted in
  // AppShell) — it starts the instant ANY of this farmer's orders goes out for delivery, not
  // just while this specific page happens to be open, so it isn't tied to this component.

  // LiveDeliveryMap (below) computes its own real, traffic-aware ETA/distance/speed from
  // Google Directions — reported up here so every figure on this page (not just the map's own
  // cards) reflects that same real number instead of the coarser OSRM-based `transit` estimate
  // above. Starts null and fills in a moment after the map mounts and its route resolves; the
  // OSRM-based figures remain the fallback for that brief gap (and for any error case where
  // Directions never resolves at all).
  const [liveRoute, setLiveRoute] = useState(null);

  if (loadedId !== id) return null;
  if (!order) return <Navigate to={fallbackOrdersPath(currentUser.role)} replace />;
  if (!isBuyer && !isFarmer) {
    return <Navigate to={fallbackOrdersPath(currentUser.role)} replace />;
  }

  const navItems = getNavItemsForRole(currentUser.role);

  const run = async (action, successMessage) => {
    try {
      const updated = await action();
      setOrder(updated);
      setError('');
      setNotice(successMessage);
    } catch (actionError) {
      setNotice('');
      setError(actionError.message);
    }
  };

  const handleSubmitRating = async () => {
    if (!ratingValue) {
      setRatingError('Choose a star rating first.');
      return;
    }
    setIsSubmittingRating(true);
    setRatingError('');
    try {
      const created = await createRating({ farmerId: order.farmerId, orderId: order.id, rating: ratingValue, comment: ratingComment });
      setExistingRating(created);
    } catch (ratingSubmitError) {
      setRatingError(ratingSubmitError.message);
    } finally {
      setIsSubmittingRating(false);
    }
  };

  const nextStep = getNextDeliveryStatus(order);
  const isTrackable = order.status === 'confirmed' || order.status === 'completed';
  const deliverySequence = getDeliverySequence(order.deliveryMethod);
  // The last step in the sequence (delivered/picked up) is confirmed by the buyer via
  // "Got it" rather than the farmer, since the farmer has no way to know the moment the
  // buyer actually receives it in hand.
  const isFinalNextStep = nextStep && deliverySequence[deliverySequence.length - 1] === nextStep;
  const { remainingKm, isNearDestination } = transit;
  const isPickup = order.deliveryMethod === 'buyer_pickup';
  const trackingStatus = getDeliveryTrackingStatus(order, isInTransit, isNearDestination);

  // The real Google-based numbers once available, falling back to the OSRM-based estimate
  // above until they are — see the comment on `liveRoute` for why these exist.
  const displayEtaMinutes = liveRoute?.etaMinutes ?? etaMinutes;
  const displayEstimatedTotalMinutes = liveRoute?.etaMinutes ?? estimatedTotalMinutes;
  const displayRemainingKm = liveRoute?.isInTransit ? (liveRoute.remainingKm ?? remainingKm) : remainingKm;
  // The device's real instantaneous speed, reported up from LiveDeliveryMap — no fallback to
  // any route-average figure: that's a different, older number and would misrepresent a
  // "Current Speed" label as if it were live when it's just an upfront estimate.
  const displayCurrentSpeedKmh = liveRoute?.isInTransit ? liveRoute.currentSpeedKmh : null;

  return (
    <AppShell
      user={currentUser}
      navItems={navItems}
      title={`Order — ${order.productName}`}
      subtitle={`Order #${shortOrderId(order.id)} • ${order.quantity} ${order.unit} • ${formatCurrency(order.totalAmount)} • placed ${formatDate(order.createdAt)}`}
    >
      {notice ? <div className="form-alert success">{notice}</div> : null}
      {error ? <div className="form-alert error">{error}</div> : null}

      <section className="content-grid two uneven">
        <div className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Tracking</p>
              <h2>Order progress</h2>
            </div>
            <span className="live-indicator"><span className="live-dot" /> Live</span>
          </div>
          <OrderTracker order={order} />
        </div>

        <div className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Details</p>
              <h2>Order details</h2>
            </div>
            <div className="table-actions">
              <Link className="btn btn-secondary btn-md" to={`/orders/${order.id}/receipt`}>View receipt</Link>
              <Link className="btn btn-secondary btn-md" to={`/messages/${order.id}`}>Message {isFarmer ? order.buyerName : order.farmerName}</Link>
            </div>
          </div>
          <div className="detail-list">
            <div><span>Order #</span><strong>{shortOrderId(order.id)}</strong></div>
            <div><span>Buyer</span><strong>{order.buyerName}</strong></div>
            <div><span>Farmer</span><strong>{order.farmerName}</strong></div>
            <div><span>Payment method</span><strong>{paymentLabel(order.paymentMethod)}</strong></div>
            <div><span>Delivery method</span><strong>{deliveryMethodLabel(order.deliveryMethod)}</strong></div>
            {order.deliveryFee > 0 ? <div><span>Delivery fee</span><strong>{formatCurrency(order.deliveryFee)}</strong></div> : null}
            {order.status === 'confirmed' && displayEstimatedTotalMinutes != null ? (
              <div>
                <span>{isInTransit ? 'Estimated delivery' : 'Estimated delivery (upfront)'}</span>
                <strong>
                  {isInTransit
                    ? `~${displayEtaMinutes} min${displayEtaMinutes === 1 ? '' : 's'} left`
                    : `~${formatDurationMinutes(displayEstimatedTotalMinutes)}`}
                </strong>
              </div>
            ) : null}
            {order.message ? <div><span>Message</span><strong>{order.message}</strong></div> : null}
          </div>

          <div className="form-actions">
            {isFarmer && order.status === 'pending' ? (
              <>
                <Button onClick={() => run(() => updateOrderStatus(order.id, 'confirmed'), 'Order confirmed.')}>
                  <Check size={15} /> Confirm order
                </Button>
                <Button variant="danger" onClick={() => run(() => updateOrderStatus(order.id, 'rejected'), 'Order rejected.')}>
                  <X size={15} /> Reject order
                </Button>
              </>
            ) : null}

            {isFarmer && order.status === 'confirmed' && nextStep && !isFinalNextStep ? (
              <Button onClick={() => run(() => advanceDelivery(order.id), `Order marked "${DELIVERY_STEP_LABELS[nextStep]}".`)}>
                {nextStep === 'out_for_delivery' ? (
                  <><Navigation size={15} /> Start Delivery</>
                ) : (
                  <>Mark {DELIVERY_STEP_LABELS[nextStep]}</>
                )}
              </Button>
            ) : null}

            {isBuyer && order.status === 'confirmed' && isFinalNextStep ? (
              <Button onClick={() => run(() => advanceDelivery(order.id), 'The order is received! Thank you for confirming.')}>
                <Check size={15} /> Got it
              </Button>
            ) : null}

            {isBuyer && order.paymentStatus === 'pending' && ONLINE_PAYMENT_METHODS.includes(order.paymentMethod) ? (
              <Button onClick={() => run(() => payOrder(order.id), 'Payment confirmed.')}>Pay now</Button>
            ) : null}

            {isBuyer && isCancellable(order) ? (
              <Button variant="danger" onClick={() => run(() => cancelOrder(order.id), 'Order cancelled.')}>Cancel order</Button>
            ) : null}
          </div>
        </div>
      </section>

      {isBuyer && order.status === 'completed' ? (
        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Feedback</p>
              <h2>Rate {order.farmerName}</h2>
            </div>
          </div>
          {existingRating ? (
            <div className="rating-summary">
              <StarRating value={existingRating.rating} />
              <span>You rated this farm {existingRating.rating} star{existingRating.rating === 1 ? '' : 's'}.</span>
              {existingRating.comment ? <p className="muted">"{existingRating.comment}"</p> : null}
            </div>
          ) : (
            <div className="form-stack">
              {ratingError ? <div className="form-alert error">{ratingError}</div> : null}
              <StarRating value={ratingValue} onChange={setRatingValue} size={26} />
              <textarea
                rows="3"
                value={ratingComment}
                onChange={(event) => setRatingComment(event.target.value)}
                placeholder="Optional — how was the produce and the farmer's service?"
              />
              <Button onClick={handleSubmitRating} disabled={isSubmittingRating}>
                {isSubmittingRating ? 'Submitting…' : 'Submit rating'}
              </Button>
            </div>
          )}
        </section>
      ) : null}

      {isTrackable && !isPickup ? (
        <section className="tracking-info-cards-wrap">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Delivery tracking</p>
              <h2 className="tracking-info-heading">Live overview</h2>
            </div>
          </div>
          <div className="stats-grid">
            <StatCard label="Farmer" value={order.farmerName} icon={<User size={20} />} />
            <StatCard label="Buyer" value={order.buyerName} icon={<User size={20} />} />
            <StatCard
              label="Current Status"
              value={(
                <span className={`tracking-badge tracking-${trackingStatus.key}`}>
                  {TRACKING_STATUS_EMOJI[trackingStatus.key]} {trackingStatus.label}
                </span>
              )}
              icon={<Truck size={20} />}
            />
            {order.status === 'confirmed' && (isInTransit ? displayEtaMinutes != null : displayEstimatedTotalMinutes != null) ? (
              <StatCard
                label="Estimated Arrival"
                value={isInTransit ? `${displayEtaMinutes} min${displayEtaMinutes === 1 ? '' : 's'}` : formatDurationMinutes(displayEstimatedTotalMinutes)}
                icon={<Clock3 size={20} />}
              />
            ) : null}
            {displayRemainingKm != null ? (
              <StatCard label="Remaining Distance" value={`${displayRemainingKm.toFixed(1)} km`} icon={<MapPin size={20} />} />
            ) : null}
            {isInTransit && displayCurrentSpeedKmh != null ? (
              <StatCard label="Current Speed" value={`${displayCurrentSpeedKmh.toFixed(0)} km/h`} icon={<Gauge size={20} />} />
            ) : null}
          </div>
        </section>
      ) : null}

      {isTrackable ? (
        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Map</p>
              <h2>{isPickup ? 'Route to pickup location' : 'Delivery route'}</h2>
            </div>
            {isInTransit ? (
              <span className="live-indicator">
                <span className="live-dot" /> {isLiveGps ? 'Live GPS' : 'Estimated'}
                {displayRemainingKm != null ? ` · ${displayRemainingKm.toFixed(1)} km left` : ''} · ETA ~{displayEtaMinutes} min{displayEtaMinutes === 1 ? '' : 's'}
              </span>
            ) : (
              <span className="live-indicator"><span className="live-dot" /> Live</span>
            )}
          </div>
          <LiveDeliveryMap
            order={order}
            destinationMunicipalityOverride={isPickup
              ? (isBuyer ? currentUser.municipality : pickupBuyerMunicipality) || order.deliveryMunicipality
              : undefined}
            onRouteUpdate={setLiveRoute}
          />
        </section>
      ) : null}

      <Button variant="ghost" onClick={() => navigate(-1)}>Back</Button>
    </AppShell>
  );
}
