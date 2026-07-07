import { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import AppShell from '../../components/layout/AppShell';
import Button from '../../components/common/Button';
import OrderTracker from '../../components/orders/OrderTracker';
import DeliveryMap from '../../components/orders/DeliveryMap';
import { useAuth } from '../auth/AuthContext';
import {
  advanceDelivery,
  cancelOrder,
  getDeliverySequence,
  getNextDeliveryStatus,
  getOrderById,
  isCancellable,
  payOrder,
  updateOrderStatus,
} from '../../services/orderService';
import { DELIVERY_STEP_LABELS, ONLINE_PAYMENT_METHODS, STORAGE_KEYS } from '../../utils/constants';
import { deliveryMethodLabel, formatCurrency, formatDate, paymentLabel } from '../../utils/formatters';
import { buyerNavItems } from '../buyer/buyerNav';
import { farmerNavItems } from '../farmer/farmerNav';

export default function OrderTracking() {
  const { id } = useParams();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [order, setOrder] = useState(() => getOrderById(id));
  const [notice, setNotice] = useState(location.state?.notice || '');
  const [error, setError] = useState('');

  useEffect(() => {
    const refresh = () => setOrder(getOrderById(id));
    const handleStorage = (event) => {
      if (!event.key || event.key === STORAGE_KEYS.orders) refresh();
    };
    const interval = setInterval(refresh, 4000);
    window.addEventListener('storage', handleStorage);
    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', handleStorage);
    };
  }, [id]);

  if (!order) return <Navigate to={currentUser.role === 'farmer' ? '/farmer-orders' : '/buyer-orders'} replace />;

  const isBuyer = currentUser.role === 'buyer' && currentUser.id === order.buyerId;
  const isFarmer = currentUser.role === 'farmer' && currentUser.id === order.farmerId;
  if (!isBuyer && !isFarmer) {
    return <Navigate to={currentUser.role === 'farmer' ? '/farmer-orders' : '/buyer-orders'} replace />;
  }

  const navItems = currentUser.role === 'farmer' ? farmerNavItems : buyerNavItems;

  const run = (action, successMessage) => {
    try {
      const updated = action();
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
  const stepIndex = Math.max(0, deliverySequence.indexOf(order.deliveryStatus));
  const progress = deliverySequence.length > 1 ? stepIndex / (deliverySequence.length - 1) : 0;

  return (
    <AppShell
      user={currentUser}
      navItems={navItems}
      title={`Order — ${order.productName}`}
      subtitle={`${order.quantity} ${order.unit} • ${formatCurrency(order.totalAmount)} • placed ${formatDate(order.createdAt)}`}
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
            <Link className="btn btn-secondary btn-md" to={`/messages/${order.id}`}>Message {isFarmer ? order.buyerName : order.farmerName}</Link>
          </div>
          <div className="detail-list">
            <div><span>Buyer</span><strong>{order.buyerName}</strong></div>
            <div><span>Farmer</span><strong>{order.farmerName}</strong></div>
            <div><span>Payment method</span><strong>{paymentLabel(order.paymentMethod)}</strong></div>
            <div><span>Delivery method</span><strong>{deliveryMethodLabel(order.deliveryMethod)}</strong></div>
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

            {isFarmer && order.status === 'confirmed' && nextStep ? (
              <Button onClick={() => run(() => advanceDelivery(order.id), `Order marked "${DELIVERY_STEP_LABELS[nextStep]}".`)}>
                Mark {DELIVERY_STEP_LABELS[nextStep]}
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
              <h2>{order.deliveryMethod === 'buyer_pickup' ? 'Pickup location' : 'Delivery route'}</h2>
            </div>
            <span className="live-indicator"><span className="live-dot" /> Live</span>
          </div>
          <DeliveryMap
            routes={[{
              id: order.id,
              originLabel: `${order.farmerName} (farmer)`,
              destinationLabel: order.deliveryMethod === 'buyer_pickup' ? `${order.buyerName} (pickup here)` : `${order.buyerName} (buyer)`,
              originMunicipality: order.originMunicipality,
              destinationMunicipality: order.deliveryMunicipality,
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
