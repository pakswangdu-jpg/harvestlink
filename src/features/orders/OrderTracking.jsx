import { useEffect, useState } from 'react';
import { BadgeCheck, Check, FileText, MessageCircle, Navigation, Package, Truck, X } from 'lucide-react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import AppShell from '../../components/layout/AppShell';
import Button from '../../components/common/Button';
import StarRating from '../../components/common/StarRating';
import StatusBadge from '../../components/common/StatusBadge';
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
  updateOrderStatus,
} from '../../services/orderService';
import { DELIVERY_STEP_LABELS, ONLINE_PAYMENT_METHODS } from '../../utils/constants';
import {
  deliveryMethodLabel,
  formatCurrency,
  formatDate,
  formatDurationMinutes,
  getInitials,
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

  return (
    <AppShell
      user={currentUser}
      navItems={navItems}
      title={`Order — ${order.productName}`}
    >
      <div className="ot-page">
        {notice ? <div className="form-alert success">{notice}</div> : null}
        {error ? <div className="form-alert error">{error}</div> : null}

        <div className="ot-header-bar">
          <div className="ot-header-badges">
            <span className="ot-chip"><FileText size={13} /> #{shortOrderId(order.id)}</span>
            <span className="ot-chip"><Package size={13} /> {order.quantity} {order.unit}</span>
            <span className="ot-chip">{formatCurrency(order.totalAmount)}</span>
            <span className="ot-chip">{formatDate(order.createdAt)}</span>
          </div>
          <div className="ot-header-statuses">
            <StatusBadge value={order.deliveryStatus} type="deliveryStatus" />
            <StatusBadge value={order.paymentStatus} type="paymentStatus" />
          </div>
        </div>

        <section className="ot-main-grid">
          <div className="panel ot-progress-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Tracking</p>
                <h2>Order progress</h2>
              </div>
              <span className="live-indicator"><span className="live-dot" /> Live</span>
            </div>
            <OrderTracker order={order} />
          </div>

          <div className="panel ot-details-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Details</p>
                <h2>Order details</h2>
              </div>
            </div>

            <div className="ot-detail-groups">
              <div className="ot-detail-group">
                <h4>General Information</h4>
                <div className="ot-detail-row"><span>Order #</span><strong>{shortOrderId(order.id)}</strong></div>
                <div className="ot-detail-row"><span>Buyer</span><strong>{order.buyerName}</strong></div>
                <div className="ot-detail-row"><span>Farmer</span><strong>{order.farmerName}</strong></div>
              </div>

              <div className="ot-detail-group">
                <h4>Payment</h4>
                <div className="ot-detail-row"><span>Payment method</span><strong>{paymentLabel(order.paymentMethod)}</strong></div>
                <div className="ot-detail-row"><span>Payment status</span><StatusBadge value={order.paymentStatus} type="paymentStatus" /></div>
              </div>

              <div className="ot-detail-group">
                <h4>Delivery</h4>
                <div className="ot-detail-row"><span>Delivery method</span><strong>{deliveryMethodLabel(order.deliveryMethod)}</strong></div>
                {order.deliveryFee > 0 ? (
                  <div className="ot-detail-row">
                    <span>Delivery fee{order.deliveryFeeTier ? ` (${order.deliveryFeeTier})` : ''}</span>
                    <strong>{formatCurrency(order.deliveryFee)}</strong>
                  </div>
                ) : null}
                {order.status === 'confirmed' && displayEstimatedTotalMinutes != null ? (
                  <div className="ot-detail-row">
                    <span>{isInTransit ? 'Estimated delivery' : 'Estimated delivery (upfront)'}</span>
                    <strong>
                      {isInTransit
                        ? `~${displayEtaMinutes} min${displayEtaMinutes === 1 ? '' : 's'} left`
                        : `~${formatDurationMinutes(displayEstimatedTotalMinutes)}`}
                    </strong>
                  </div>
                ) : null}
              </div>

              {order.message ? (
                <div className="ot-detail-group">
                  <h4>Additional Information</h4>
                  <div className="ot-detail-row ot-detail-row-message"><span>Message</span><strong>{order.message}</strong></div>
                </div>
              ) : null}
            </div>

            <div className="ot-action-links">
              <Link className="btn btn-secondary btn-md" to={`/orders/${order.id}/receipt`}>
                <FileText size={15} /> View Receipt
              </Link>
              <Link className="btn btn-primary btn-md" to={`/messages/${order.id}`}>
                <MessageCircle size={15} /> Message {isFarmer ? order.buyerName : order.farmerName}
              </Link>
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
                <Button onClick={() => navigate(`/orders/${order.id}/pay/gcash`)}>Pay now</Button>
              ) : null}

              {isBuyer && isCancellable(order) ? (
                <Button variant="danger" onClick={() => run(() => cancelOrder(order.id), 'Order cancelled.')}>Cancel order</Button>
              ) : null}
            </div>
          </div>
        </section>

        {isBuyer && order.status === 'completed' ? (
          <section className="panel ot-feedback-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Feedback</p>
                <h2>Rate {order.farmerName}</h2>
              </div>
            </div>
            {existingRating ? (
              <div className="ot-review-card">
                <div className="ot-review-header">
                  <StarRating value={existingRating.rating} />
                  <span className="ot-verified-badge"><BadgeCheck size={14} /> Verified Purchase</span>
                </div>
                {existingRating.comment ? <p className="ot-review-comment">&quot;{existingRating.comment}&quot;</p> : null}
                {existingRating.createdAt ? <p className="ot-review-date">Reviewed {formatDate(existingRating.createdAt)}</p> : null}
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
          <section className="ot-summary-cards-wrap">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Delivery tracking</p>
                <h2 className="tracking-info-heading">Live overview</h2>
              </div>
            </div>
            <div className="ot-summary-cards">
              <div className="ot-summary-card">
                <span className="farmer-list-avatar">{getInitials(order.farmerName)}</span>
                <div>
                  <p>Farmer</p>
                  <strong>{order.farmerName}</strong>
                </div>
              </div>
              <div className="ot-summary-card">
                <span className="farmer-list-avatar buyer">{getInitials(order.buyerName)}</span>
                <div>
                  <p>Buyer</p>
                  <strong>{order.buyerName}</strong>
                </div>
              </div>
              <div className="ot-summary-card">
                <span className="ot-summary-icon"><Truck size={18} /></span>
                <div>
                  <p>Delivery Status</p>
                  <span className={`tracking-badge tracking-${trackingStatus.key}`}>
                    {TRACKING_STATUS_EMOJI[trackingStatus.key]} {trackingStatus.label}
                  </span>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {isTrackable ? (
          <section className="panel ot-map-panel">
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
              deliveryStatusBadge={!isPickup ? (
                <span className={`tracking-badge tracking-${trackingStatus.key}`}>
                  {TRACKING_STATUS_EMOJI[trackingStatus.key]} {trackingStatus.label}
                </span>
              ) : null}
            />
          </section>
        ) : null}

        <Button variant="ghost" onClick={() => navigate(-1)}>Back</Button>
      </div>
    </AppShell>
  );
}
