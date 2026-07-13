import { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import AppShell from '../../components/layout/AppShell';
import Button from '../../components/common/Button';
import OrderTracker from '../../components/orders/OrderTracker';
import DeliveryMap from '../../components/orders/DeliveryMap';
import { useAuth } from '../auth/AuthContext';
import { getUserById } from '../../services/authService';
import {
  advanceDelivery,
  cancelOrder,
  getDeliverySequence,
  getLiveTransitProgress,
  getNextDeliveryStatus,
  getOrderById,
  isCancellable,
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

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      getOrderById(id)
        .then((result) => {
          if (cancelled) return;
          setOrder(result);
          setLoadedId(id);
        })
        .catch(() => {
          if (cancelled) return;
          setOrder(null);
          setLoadedId(id);
        });
    };
    refresh();
    const interval = setInterval(refresh, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
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

  if (loadedId !== id) return null;
  if (!order) return <Navigate to={fallbackOrdersPath(currentUser.role)} replace />;

  // "Buyer" here means "the account that placed this order" — a partner organization
  // checking out through the marketplace is just as much the buyer as a buyer-role
  // account is, so this checks id ownership, not the literal account role.
  const isBuyer = currentUser.id === order.buyerId;
  const isFarmer = currentUser.role === 'farmer' && currentUser.id === order.farmerId;
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

  const nextStep = getNextDeliveryStatus(order);
  const isTrackable = order.status === 'confirmed' || order.status === 'completed';
  const deliverySequence = getDeliverySequence(order.deliveryMethod);
  // The last step in the sequence (delivered/picked up) is confirmed by the buyer via
  // "Got it" rather than the farmer, since the farmer has no way to know the moment the
  // buyer actually receives it in hand.
  const isFinalNextStep = nextStep && deliverySequence[deliverySequence.length - 1] === nextStep;
  const { progress, etaMinutes, estimatedTotalMinutes, isInTransit } = getLiveTransitProgress(order);
  const isPickup = order.deliveryMethod === 'buyer_pickup';

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
            {order.status === 'confirmed' && estimatedTotalMinutes != null ? (
              <div>
                <span>{isInTransit ? 'Estimated delivery' : 'Estimated delivery (upfront)'}</span>
                <strong>
                  {isInTransit
                    ? `~${etaMinutes} min${etaMinutes === 1 ? '' : 's'} left`
                    : `~${formatDurationMinutes(estimatedTotalMinutes)}`}
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
                Mark {DELIVERY_STEP_LABELS[nextStep]}
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

      {isTrackable ? (
        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Map</p>
              <h2>{isPickup ? 'Route to pickup location' : 'Delivery route'}</h2>
            </div>
            {isInTransit ? (
              <span className="live-indicator"><span className="live-dot" /> ETA ~{etaMinutes} min{etaMinutes === 1 ? '' : 's'}</span>
            ) : (
              <span className="live-indicator"><span className="live-dot" /> Live</span>
            )}
          </div>
          <DeliveryMap
            routes={[{
              id: order.id,
              // For pickup, the destination pin represents where the buyer starts from,
              // not the farm itself — the route shows how to get there, not a delivery.
              originLabel: isPickup ? `${order.farmerName} (pickup here)` : `${order.farmerName} (farmer)`,
              destinationLabel: isPickup ? `${order.buyerName} (starting point)` : `${order.buyerName} (buyer)`,
              originMunicipality: order.originMunicipality,
              destinationMunicipality: isPickup
                ? (isBuyer ? currentUser.municipality : pickupBuyerMunicipality) || order.deliveryMunicipality
                : order.deliveryMunicipality,
              deliveryMethod: order.deliveryMethod,
              progress,
              label: order.productName,
            }]}
          />
        </section>
      ) : null}

      <Button variant="ghost" onClick={() => navigate(-1)}>Back</Button>
    </AppShell>
  );
}
