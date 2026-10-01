import { useEffect, useState } from 'react';
import {
  BadgeCheck, Check, CheckCircle2, Clock3, Copy, FileText, Map, MapPin, MessageCircle, Navigation, Package, RotateCcw, Truck, X,
} from 'lucide-react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import AppShell from '../../components/layout/AppShell';
import Button from '../../components/common/Button';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import StarRating from '../../components/common/StarRating';
import StatusBadge from '../../components/common/StatusBadge';
import PaymentMethodLabel from '../../components/common/PaymentMethodLabel';
import DeliveryTruckIcon from '../../components/icons/DeliveryTruckIcon';
import OrderTracker from '../../components/orders/OrderTracker';
import LiveDeliveryMap from '../../components/orders/LiveDeliveryMap';
import DeliveryInfoCard from '../../components/orders/DeliveryInfoCard';
import CourierDeliveryTimeline from '../../components/orders/CourierDeliveryTimeline';
import DeliveryTrackingOverlay from '../../components/orders/DeliveryTrackingOverlay';
import { useAuth } from '../auth/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { getUserById } from '../../services/authService';
import { createRating, getRatingForOrder } from '../../services/ratingService';
import { getDelivery } from '../../services/deliveryService';
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
  shortOrderId,
} from '../../utils/formatters';
import { getNavItemsForRole } from '../../utils/navItemsByRole';






const TRACKING_STATUS_ICON = {
  pending: Clock3,
  confirmed: Check,
  'on-the-way': Truck,
  'near-destination': MapPin,
  delivered: CheckCircle2,
  rejected: X,
  cancelled: X,
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
  const [delivery, setDelivery] = useState(null);
  const [notice, setNotice] = useState(location.state?.notice || '');
  const [error, setError] = useState('');
  const [existingRating, setExistingRating] = useState(null);
  const [ratingValue, setRatingValue] = useState(0);
  const [ratingComment, setRatingComment] = useState('');
  const [isSubmittingRating, setIsSubmittingRating] = useState(false);
  const [ratingError, setRatingError] = useState('');
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [orderIdCopied, setOrderIdCopied] = useState(false);

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





  const needsDeliveryLookup = Boolean(order) && order.deliveryMethod === 'courier';
  useEffect(() => {
    if (!needsDeliveryLookup) return undefined;
    let cancelled = false;
    const poll = () => {
      getDelivery(order.id).then((result) => { if (!cancelled) setDelivery(result); }).catch(() => {});
    };
    poll();
    const interval = setInterval(poll, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [needsDeliveryLookup, order?.id]);




  const isBuyer = Boolean(order) && currentUser.id === order.buyerId;
  const isFarmer = Boolean(order) && currentUser.role === 'farmer' && currentUser.id === order.farmerId;



  const needsRatingCheck = isBuyer && order?.status === 'completed';
  useEffect(() => {
    if (!needsRatingCheck) return undefined;
    let cancelled = false;
    getRatingForOrder(order.id)
      .then((result) => {
        if (!cancelled) setExistingRating(result);
      })
      .catch(() => {



      });
    return () => {
      cancelled = true;
    };
  }, [needsRatingCheck, order?.id]);

  const transit = order ? getLiveTransitProgress(order) : null;
  const { etaMinutes = null, estimatedTotalMinutes = null, isInTransit = false, isLiveGps = false } = transit || {};











  const [liveRoute, setLiveRoute] = useState(null);

  const [isTrackingOpen, setIsTrackingOpen] = useState(false);

  if (loadedId !== id) return null;
  if (!order) return <Navigate to={fallbackOrdersPath(currentUser.role)} replace />;
  if (!isBuyer && !isFarmer) {
    return <Navigate to={fallbackOrdersPath(currentUser.role)} replace />;
  }

  const navItems = getNavItemsForRole(currentUser.role);

  const copyOrderId = async () => {
    try {
      await navigator.clipboard.writeText(`#${shortOrderId(order.id)}`);
      setOrderIdCopied(true);
      window.setTimeout(() => setOrderIdCopied(false), 1800);
    } catch {


    }
  };

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



  const isFinalNextStep = nextStep && deliverySequence[deliverySequence.length - 1] === nextStep;
  const { remainingKm, isNearDestination } = transit;
  const isPickup = order.deliveryMethod === 'buyer_pickup';
  const isCourier = order.deliveryMethod === 'courier';
  const trackingStatus = getDeliveryTrackingStatus(order, isInTransit, isNearDestination);
  const TrackingStatusIcon = TRACKING_STATUS_ICON[trackingStatus.key];



  const canBookCourier = isFarmer && isCourier && order.status === 'confirmed' && nextStep === 'out_for_delivery' && !isFinalNextStep;



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
            <span className="ot-chip">
              <FileText size={13} /> #{shortOrderId(order.id)}
              <button
                type="button"
                className="ot-chip-copy"
                onClick={copyOrderId}
                aria-label="Copy order ID"
                title={orderIdCopied ? 'Copied' : 'Copy order ID'}
              >
                {orderIdCopied ? <Check size={12} /> : <Copy size={12} />}
              </button>
            </span>
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
              <div className="ot-progress-heading-actions">
                {isTrackable ? (
                  <button type="button" className="ot-view-tracking-btn" onClick={() => setIsTrackingOpen(true)}>
                    <Map size={15} aria-hidden="true" /> View tracking
                  </button>
                ) : null}
                <span className="live-indicator"><span className="live-dot" /> Live</span>
              </div>
            </div>
            {isCourier ? (
              <CourierDeliveryTimeline order={order} delivery={delivery} isFarmer={isFarmer} onDeliveryUpdate={setDelivery} />
            ) : <OrderTracker order={order} isFarmer={isFarmer} />}
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
                <div className="ot-detail-row ot-detail-row-product">
                  <span>Product</span>
                  <div className="ot-product-summary">
                    <span className="ot-product-thumb">
                      {order.productImageUrl ? <img src={order.productImageUrl} alt="" /> : <Package size={16} />}
                    </span>
                    <strong>{order.productName}</strong>
                  </div>
                </div>
                <div className="ot-detail-row"><span>Quantity</span><strong>{order.quantity} {order.unit}</strong></div>
                <div className="ot-detail-row"><span>Product amount</span><strong>{formatCurrency(order.unitPrice * order.quantity)}</strong></div>
                <div className="ot-detail-row"><span>Buyer</span><strong>{order.buyerName}</strong></div>
                <div className="ot-detail-row ot-detail-row-farmer">
                  <span>Farmer</span>
                  <div className="ot-farmer-profile">
                    <span className="farmer-list-avatar">
                      {order.farmerAvatarUrl ? <img src={order.farmerAvatarUrl} alt="" /> : getInitials(order.farmerName)}
                    </span>
                    <span className="ot-farmer-profile-text">
                      <span className="ot-farmer-name">
                        {order.farmerName}
                        {order.farmerVerificationStatus === 'verified' ? <BadgeCheck size={13} className="ot-farmer-verified-icon" /> : null}
                      </span>
                      {order.farmerFarmName ? <span className="ot-farmer-farm">{order.farmerFarmName}</span> : null}
                      {order.originMunicipality ? <span className="ot-farmer-location"><MapPin size={11} /> {order.originMunicipality}</span> : null}
                    </span>
                  </div>
                </div>
              </div>

              <div className="ot-detail-group">
                <h4>Payment</h4>
                <div className="ot-detail-row"><span>Payment method</span><strong><PaymentMethodLabel method={order.paymentMethod} /></strong></div>
                <div className="ot-detail-row"><span>{order.paymentMethod === 'cod' ? 'Amount to collect' : 'Amount'}</span><strong>{formatCurrency(order.totalAmount)}</strong></div>
                <div className="ot-detail-row"><span>Payment status</span><StatusBadge value={order.paymentStatus} type="paymentStatus" /></div>
                {order.paymentMethod === 'gcash' && order.paymentVerificationStatus ? (
                  <>
                    <div className="ot-detail-row"><span>Verification</span><StatusBadge value={order.paymentVerificationStatus} type="paymentVerificationStatus" /></div>
                    <div className="ot-detail-row"><span>Reference #</span><strong>{order.paymentReferenceNumber}</strong></div>
                    <div className="ot-detail-row"><span>Sender name</span><strong>{order.paymentSenderName}</strong></div>
                    <div className="ot-detail-row"><span>Submitted</span><strong>{formatDate(order.paymentSubmittedAt)}</strong></div>
                  </>
                ) : null}
                {order.paymentVerificationStatus === 'rejected' ? (
                  <div className="form-alert error payment-rejection-alert">
                    <strong>❌ Payment Verification Failed</strong>
                    <p>{order.paymentRejectionReason}</p>
                    {isBuyer ? (
                      <Button size="sm" onClick={() => navigate(`/orders/${order.id}/pay/gcash/confirm`)}>Re-upload receipt</Button>
                    ) : null}
                  </div>
                ) : null}
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
                {order.status === 'confirmed' && !isCourier && displayEstimatedTotalMinutes != null ? (
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

              {isFarmer && order.status === 'confirmed' && nextStep && !isFinalNextStep && !(isCourier && nextStep === 'out_for_delivery') ? (
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

              {isBuyer && order.status === 'completed' ? (
                <Link className="btn btn-secondary btn-md" to={`/products/${order.productId}`}>
                  <RotateCcw size={15} /> Buy Again
                </Link>
              ) : null}

              {isBuyer && order.paymentStatus === 'pending' && ONLINE_PAYMENT_METHODS.includes(order.paymentMethod)
              && !order.paymentVerificationStatus ? (
                <Button onClick={() => navigate(`/orders/${order.id}/pay/gcash`)}>Pay now</Button>
              ) : null}

              {isBuyer && isCancellable(order) ? (
                <Button variant="danger" onClick={() => setIsCancelDialogOpen(true)}>Cancel order</Button>
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

        {


                                                                                         }
        <DeliveryTrackingOverlay
          open={isTrackingOpen}
          onClose={() => setIsTrackingOpen(false)}
          title={isPickup ? 'Pickup tracking' : 'Delivery tracking'}
        >
        {isTrackable ? (
          <section className="ot-summary-cards-wrap">
            <div className="section-heading">
              <div>
                <p className="eyebrow">{isPickup ? 'Pickup tracking' : 'Delivery tracking'}</p>
                <h2 className="tracking-info-heading">Live overview</h2>
              </div>
            </div>
            <div className="ot-summary-cards">
              <div className="ot-summary-card">
                <span className="farmer-list-avatar">
                  {order.farmerAvatarUrl ? <img src={order.farmerAvatarUrl} alt="" /> : getInitials(order.farmerName)}
                </span>
                <div>
                  <p>Farmer</p>
                  <strong>{order.farmerName}</strong>
                </div>
              </div>
              <div className="ot-summary-card">
                <span className="farmer-list-avatar buyer">
                  {order.buyerAvatarUrl ? <img src={order.buyerAvatarUrl} alt="" /> : getInitials(order.buyerName)}
                </span>
                <div>
                  <p>Buyer</p>
                  <strong>{order.buyerName}</strong>
                </div>
              </div>
              <div className="ot-summary-card">
                <span className="ot-summary-icon"><DeliveryTruckIcon size={18} /></span>
                <div>
                  <p>{isPickup ? 'Pickup Status' : 'Delivery Status'}</p>
                  <span className={`tracking-badge tracking-${trackingStatus.key}`}>
                    <TrackingStatusIcon size={13} strokeWidth={2.5} /> {trackingStatus.label}
                  </span>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {isTrackable && isCourier ? (
          <DeliveryInfoCard
            order={order}
            delivery={delivery}
            isFarmer={isFarmer}
            canBook={canBookCourier}
            onBooked={(result) => {
              if (result.order) setOrder(result.order);
              setDelivery(result.delivery);
              setError('');
              setNotice(result.order
                ? '✓ Delivery successfully linked with Lalamove.'
                : 'Delivery information updated.');
            }}
          />
        ) : null}

        {isTrackable ? (
          <section className="panel ot-map-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Map</p>
                <h2>{isPickup ? 'Route to pickup location' : isCourier ? 'Courier route' : 'Delivery route'}</h2>
              </div>
              {isCourier ? (
                <span className="live-indicator"><span className="live-dot" /> Route preview</span>
              ) : isInTransit ? (
                <span className="live-indicator">
                  <span className="live-dot" /> {isLiveGps ? 'Live GPS' : 'Estimated'}
                  {displayRemainingKm != null ? ` · ${displayRemainingKm.toFixed(1)} km left` : ''} · ETA ~{displayEtaMinutes} min{displayEtaMinutes === 1 ? '' : 's'}
                </span>
              ) : (
                <span className="live-indicator"><span className="live-dot" /> Live</span>
              )}
            </div>
            {isCourier ? (
              <p className="muted ot-map-note">
                This shows the road route between the farm and buyer addresses on file — for your courier&apos;s actual live
                position, use Track Delivery above.
              </p>
            ) : null}

            <LiveDeliveryMap
              order={order}
              destinationMunicipalityOverride={isPickup
                ? (isBuyer ? currentUser.municipality : pickupBuyerMunicipality) || order.deliveryMunicipality
                : undefined}
              onRouteUpdate={setLiveRoute}
              deliveryStatusBadge={(
                <span className={`tracking-badge tracking-${trackingStatus.key}`}>
                  <TrackingStatusIcon size={13} strokeWidth={2.5} /> {trackingStatus.label}
                </span>
              )}
            />
          </section>
        ) : null}
        </DeliveryTrackingOverlay>

        <Button variant="ghost" onClick={() => navigate(-1)}>Back</Button>
      </div>

      <ConfirmDialog
        open={isCancelDialogOpen}
        title="Cancel Order?"
        message="Are you sure you want to cancel this order? This action cannot be undone."
        confirmLabel="Yes, Cancel Order"
        cancelLabel="Keep Order"
        onConfirm={() => { setIsCancelDialogOpen(false); run(() => cancelOrder(order.id), 'Order cancelled.'); }}
        onCancel={() => setIsCancelDialogOpen(false)}
      />
    </AppShell>
  );
}
