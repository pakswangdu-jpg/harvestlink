import { useEffect, useRef, useState } from 'react';
import {
  BadgeCheck, Check, CheckCircle2, Clock3, Copy, FileText, Map, MapPin, MessageCircle, Navigation, Package, RotateCcw, Truck, X,
} from 'lucide-react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import AppShell from '../../components/layout/AppShell';
import Button from '../../components/common/Button';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import StartDeliveryDialog from '../../components/orders/StartDeliveryDialog';
import StarRating from '../../components/common/StarRating';
import StatusBadge from '../../components/common/StatusBadge';
import PaymentMethodLabel from '../../components/common/PaymentMethodLabel';
import OrderTracker from '../../components/orders/OrderTracker';
import LiveDeliveryMap from '../../components/orders/LiveDeliveryMap';
import DeliveryInfoCard from '../../components/orders/DeliveryInfoCard';
import CourierDeliveryTimeline from '../../components/orders/CourierDeliveryTimeline';
import DeliveryTrackingOverlay from '../../components/orders/DeliveryTrackingOverlay';
import TrackingRouteSummary from '../../components/orders/TrackingRouteSummary';
import FeedbackSuccessDialog from '../../components/orders/FeedbackSuccessDialog';
import '../../components/orders/DeliveryTrackingInfo.css';
import './OrderDetails.css';
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
import { getRegisteredCoordinates } from '../../utils/geo';
import { requestDeviceOrientationPermission } from '../../utils/vehicleMarker';
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
  const [trackingProfiles, setTrackingProfiles] = useState(null);
  const [delivery, setDelivery] = useState(null);
  const [notice, setNotice] = useState(location.state?.notice || '');
  const [error, setError] = useState('');
  const [existingRating, setExistingRating] = useState(null);
  const [ratingValue, setRatingValue] = useState(0);
  const [ratingComment, setRatingComment] = useState('');
  const [isSubmittingRating, setIsSubmittingRating] = useState(false);
  const [feedbackSuccessOrderId, setFeedbackSuccessOrderId] = useState(null);
  const ratingSubmitInFlightRef = useRef(false);
  const feedbackPanelRef = useRef(null);
  const [ratingError, setRatingError] = useState('');
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [isStartDeliveryDialogOpen, setIsStartDeliveryDialogOpen] = useState(false);
  const [isTrackingOpen, setIsTrackingOpen] = useState(false);
  const [orderIdCopied, setOrderIdCopied] = useState(false);
  const autoOpenedTrackingOrderRef = useRef(null);

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
    if (!order?.farmerId || !order?.buyerId) return undefined;
    let cancelled = false;
    Promise.all([getUserById(order.farmerId), getUserById(order.buyerId)])
      .then(([farmer, buyer]) => {
        if (cancelled) return;
        const hasRegisteredLocations = getRegisteredCoordinates(farmer) && getRegisteredCoordinates(buyer);
        setTrackingProfiles({
          orderId: order.id,
          farmerId: order.farmerId,
          buyerId: order.buyerId,
          farmer,
          buyer,
          error: hasRegisteredLocations
            ? ''
            : 'Saved Farmer and Buyer profile coordinates are required for delivery tracking.',
        });
      })
      .catch((profileError) => {
        if (!cancelled) {
          setTrackingProfiles({
            orderId: order.id,
            farmerId: order.farmerId,
            buyerId: order.buyerId,
            error: profileError.message || 'Could not load the saved delivery locations.',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [order?.id, order?.farmerId, order?.buyerId]);




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

  useEffect(() => {
    if (
      !isBuyer
      || order.deliveryMethod !== 'farmer_delivery'
      || order.deliveryStatus !== 'out_for_delivery'
      || autoOpenedTrackingOrderRef.current === order.id
    ) return;

    autoOpenedTrackingOrderRef.current = order.id;
    setIsTrackingOpen(true);
  }, [isBuyer, order?.deliveryMethod, order?.deliveryStatus, order?.id]);



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

  const hasTrackingProfiles = Boolean(order && trackingProfiles)
    && trackingProfiles.orderId === order.id
    && trackingProfiles.farmerId === order.farmerId
    && trackingProfiles.buyerId === order.buyerId;
  const farmerProfile = hasTrackingProfiles ? trackingProfiles.farmer : null;
  const buyerProfile = hasTrackingProfiles ? trackingProfiles.buyer : null;
  const profileLocationError = hasTrackingProfiles ? trackingProfiles.error : '';
  const registeredRoutePoints = {
    origin: getRegisteredCoordinates(farmerProfile),
    destination: getRegisteredCoordinates(buyerProfile),
  };
  const transit = order ? getLiveTransitProgress(order, registeredRoutePoints) : null;
  const { etaMinutes = null, estimatedTotalMinutes = null, isInTransit = false } = transit || {};











  const [liveRoute, setLiveRoute] = useState(null);

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

  const handleStartDelivery = async (plateNumber) => {
    setIsStartDeliveryDialogOpen(false);
    await requestDeviceOrientationPermission();
    try {
      const updated = await advanceDelivery(order.id, plateNumber);
      setOrder(updated);
      setError('');
      setNotice(`Order marked "${DELIVERY_STEP_LABELS.out_for_delivery}".`);
      setIsTrackingOpen(true);
    } catch (actionError) {
      setNotice('');
      setError(actionError.message);
    }
  };

  const handleSubmitRating = async () => {
    if (ratingSubmitInFlightRef.current) return;
    if (!ratingValue) {
      setRatingError('Choose a star rating first.');
      return;
    }
    ratingSubmitInFlightRef.current = true;
    setIsSubmittingRating(true);
    setRatingError('');
    try {
      const created = await createRating({ farmerId: order.farmerId, orderId: order.id, rating: ratingValue, comment: ratingComment });
      setExistingRating(created);
      setFeedbackSuccessOrderId(order.id);
    } catch (ratingSubmitError) {
      setRatingError(ratingSubmitError.message);
    } finally {
      ratingSubmitInFlightRef.current = false;
      setIsSubmittingRating(false);
    }
  };

  const nextStep = getNextDeliveryStatus(order);
  const isTrackable = order.status === 'confirmed' || order.status === 'completed';
  const deliverySequence = getDeliverySequence(order.deliveryMethod);



  const isFinalNextStep = nextStep && deliverySequence[deliverySequence.length - 1] === nextStep;
  const { isNearDestination } = transit;
  const isPickup = order.deliveryMethod === 'buyer_pickup';
  const isCourier = order.deliveryMethod === 'courier';
  const trackingStatus = getDeliveryTrackingStatus(order, isInTransit, isNearDestination);
  const TrackingStatusIcon = TRACKING_STATUS_ICON[trackingStatus.key];



  const canBookCourier = isFarmer && isCourier && order.status === 'confirmed' && nextStep === 'out_for_delivery' && !isFinalNextStep;



  const displayEtaMinutes = liveRoute ? liveRoute.etaMinutes : etaMinutes;
  const displayEstimatedTotalMinutes = liveRoute?.etaMinutes ?? estimatedTotalMinutes;
  const receiverRole = buyerProfile?.role === 'stakeholder' || (isBuyer && currentUser.role === 'stakeholder') ? 'stakeholder' : 'buyer';
  const trackingRouteTitle = isPickup ? 'Route to pickup location' : receiverRole === 'stakeholder' ? 'Route to drop-off location' : 'Route to delivery location';

  return (
    <AppShell
      user={currentUser}
      navItems={navItems}
      title={`Order — ${order.productName}`}
    >
      <div className="ot-page">
        {notice ? <div className="form-alert success">{notice}</div> : null}
        {error || profileLocationError
          ? <div className="form-alert error">{error || profileLocationError}</div>
          : null}

        <div className="ot-header-bar">
          <div className="ot-order-summary">
            <div className="ot-order-number">
              <strong>Order #{shortOrderId(order.id)}</strong>
              <button
                type="button"
                className="ot-chip-copy"
                onClick={copyOrderId}
                aria-label="Copy order ID"
                title={orderIdCopied ? 'Copied' : 'Copy order ID'}
              >
                {orderIdCopied ? <Check size={12} /> : <Copy size={12} />}
              </button>
            </div>
            <div className="ot-order-meta">
              <span>{order.quantity} {order.unit}</span>
              <span>{formatCurrency(order.totalAmount)}</span>
              <span>{formatDate(order.createdAt)}</span>
            </div>
          </div>
          <div className="ot-header-statuses" role="group" aria-label="Delivery and payment status">
            <div className="ot-header-status-item">
              <span className="ot-header-status-label">Delivery</span>
              <div className="ot-header-status-value">
                {['delivered', 'picked_up'].includes(order.deliveryStatus) ? <CheckCircle2 size={16} aria-hidden="true" /> : null}
                <StatusBadge value={order.deliveryStatus} type="deliveryStatus" />
              </div>
            </div>
            <div className="ot-header-status-item">
              <span className="ot-header-status-label">Payment</span>
              <div className="ot-header-status-value">
                {order.paymentStatus === 'paid' ? <CheckCircle2 size={16} aria-hidden="true" /> : null}
                <StatusBadge value={order.paymentStatus} type="paymentStatus" />
              </div>
            </div>
          </div>
        </div>

        <section className="ot-main-grid">
          <div className="panel ot-progress-panel">
            <div className="section-heading">
              <div>
                <h2>Order progress</h2>
                <p className="ot-section-subtitle">Track the current order status</p>
              </div>
              <div className="ot-progress-heading-actions">
                {isTrackable ? (
                  <button type="button" className="ot-view-tracking-btn" onClick={() => setIsTrackingOpen(true)}>
                    <Map size={15} aria-hidden="true" /> View live tracking
                  </button>
                ) : null}
              </div>
            </div>
            {isCourier ? (
              <CourierDeliveryTimeline order={order} delivery={delivery} isFarmer={isFarmer} onDeliveryUpdate={setDelivery} />
            ) : <OrderTracker order={order} isFarmer={isFarmer} showSummary={false} />}
          </div>

          <div className="panel ot-details-panel">
            <div className="section-heading">
              <div>
                <h2>Order details</h2>
              </div>
            </div>

            <div className="ot-detail-groups">
              <div className="ot-detail-group">
                <h4>Order information</h4>
                <div className="ot-detail-row"><span>Order number</span><strong>{shortOrderId(order.id)}</strong></div>
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
              </div>

              <div className="ot-detail-group">
                <h4>People</h4>
                <div className="ot-detail-row ot-detail-row-farmer">
                  <span>Buyer</span>
                  <div className="ot-farmer-profile">
                    <span className="farmer-list-avatar" aria-hidden="true">
                      {order.buyerAvatarUrl ? <img src={order.buyerAvatarUrl} alt="" /> : getInitials(order.buyerName)}
                    </span>
                    <span className="ot-farmer-profile-text"><span className="ot-farmer-name">{order.buyerName}</span></span>
                  </div>
                </div>
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

              <div className="ot-detail-group ot-payment-details">
                <h4>Payment</h4>
                <div className="ot-detail-row"><span>Payment method</span><strong><PaymentMethodLabel method={order.paymentMethod} /></strong></div>
                <div className="ot-detail-row"><span>{order.paymentMethod === 'cod' ? 'Amount to collect' : 'Amount'}</span><strong className="ot-payment-amount">{formatCurrency(order.totalAmount)}</strong></div>
                <div className="ot-detail-row"><span>Payment status</span><StatusBadge value={order.paymentStatus} type="paymentStatus" /></div>
                {order.paymentMethod === 'gcash' && order.paymentVerificationStatus ? (
                  <>
                    <div className="ot-detail-row"><span>Verification</span><StatusBadge value={order.paymentVerificationStatus} type="paymentVerificationStatus" /></div>
                    <div className="ot-detail-row"><span>Reference #</span><strong className="ot-payment-reference">{order.paymentReferenceNumber}</strong></div>
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
                {order.vehiclePlateNumber ? (
                  <div className="ot-detail-row"><span>Vehicle plate number</span><strong>{order.vehiclePlateNumber}</strong></div>
                ) : null}
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
                        ? (displayEtaMinutes != null ? `~${displayEtaMinutes} min${displayEtaMinutes === 1 ? '' : 's'} left` : 'Unavailable')
                        : `~${formatDurationMinutes(displayEstimatedTotalMinutes)}`}
                    </strong>
                  </div>
                ) : null}
              </div>

              {order.message ? (
                <div className="ot-detail-group">
                  <h4>Additional information</h4>
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
                <Button onClick={() => {
                  if (nextStep === 'out_for_delivery' && order.deliveryMethod === 'farmer_delivery') {
                    setIsStartDeliveryDialogOpen(true);
                    return;
                  }
                  run(() => advanceDelivery(order.id), `Order marked "${DELIVERY_STEP_LABELS[nextStep]}".`);
                }}>
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
          <section ref={feedbackPanelRef} tabIndex={-1} className="panel ot-feedback-panel" aria-label="Order feedback">
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
              <div className="form-stack" aria-busy={isSubmittingRating}>
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
          subtitle="Live order overview"
          summary={isTrackable ? (
          <section className="delivery-tracking-info" aria-label={isPickup ? 'Pickup information' : 'Delivery information'}>
            <div className="delivery-tracking-info-row">
              <div className="delivery-tracking-info-person">
                <span className="delivery-tracking-info-avatar" aria-hidden="true">
                  {order.farmerAvatarUrl ? <img src={order.farmerAvatarUrl} alt="" /> : getInitials(order.farmerName)}
                </span>
                <div>
                  <strong>{order.farmerName}</strong>
                  <span>Farmer</span>
                </div>
              </div>
              <div className="delivery-tracking-info-person">
                <span className="delivery-tracking-info-avatar" aria-hidden="true">
                  {order.buyerAvatarUrl ? <img src={order.buyerAvatarUrl} alt="" /> : getInitials(order.buyerName)}
                </span>
                <div>
                  <strong>{order.buyerName}</strong>
                  <span>{receiverRole === 'stakeholder' ? 'Stakeholder' : 'Buyer'}</span>
                </div>
              </div>
              <div className={`delivery-tracking-info-status status-${trackingStatus.key}`}>
                <TrackingStatusIcon size={17} aria-hidden="true" />
                <div>
                  <strong>{trackingStatus.label.charAt(0) + trackingStatus.label.slice(1).toLowerCase()}</strong>
                  <span>{isPickup ? 'Pickup status' : 'Delivery status'}</span>
                </div>
              </div>
            </div>
            {!isPickup && !isCourier && order.vehiclePlateNumber ? (
              <div className="delivery-tracking-info-vehicle" aria-label={`Vehicle plate number ${order.vehiclePlateNumber}`}>
                <Truck size={16} aria-hidden="true" />
                <span>Vehicle plate</span>
                <strong>{order.vehiclePlateNumber}</strong>
              </div>
            ) : null}
          </section>
          ) : null}
        >

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
          <section className="ot-map-panel" aria-label={trackingRouteTitle}>
            <div className="ot-route-header"><h2>Order locations</h2></div>
            <TrackingRouteSummary order={order} farmerProfile={farmerProfile} buyerProfile={buyerProfile} receiverRole={receiverRole} />
            <div className="ot-route-header">
              <h2>{trackingRouteTitle}</h2>
              <span className="ot-route-header-eta">
                {Number.isFinite(displayEtaMinutes) && displayEtaMinutes >= 0
                  ? `About ${displayEtaMinutes} min`
                  : 'ETA unavailable'}
              </span>
            </div>
            {isCourier ? (
              <p className="muted ot-map-note">
                This shows the road route between the farm and buyer addresses on file — for your courier&apos;s actual live
                position, use Track Delivery above.
              </p>
            ) : null}

            <LiveDeliveryMap
              navigationEnabled={isTrackingOpen}
              canChooseAlternative={isFarmer && !isPickup && !isCourier}
              order={order}
              farmerProfile={farmerProfile}
              buyerProfile={buyerProfile}
              destinationMunicipalityOverride={isPickup
                ? (isBuyer ? currentUser.municipality : buyerProfile?.municipality) || order.deliveryMunicipality
                : undefined}
              onRouteUpdate={setLiveRoute}
              deliveryStatusSummary={trackingStatus}
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
      <FeedbackSuccessDialog
        open={feedbackSuccessOrderId === order.id}
        onClose={() => setFeedbackSuccessOrderId(null)}
        returnFocusRef={feedbackPanelRef}
      />
      <StartDeliveryDialog
        open={isStartDeliveryDialogOpen}
        onConfirm={handleStartDelivery}
        onCancel={() => setIsStartDeliveryDialogOpen(false)}
      />
    </AppShell>
  );
}
