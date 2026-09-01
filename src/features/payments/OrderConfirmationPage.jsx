import { CheckCircle2, Loader2 } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import AppShell from '../../components/layout/AppShell';
import PaymentMethodLabel from '../../components/common/PaymentMethodLabel';
import { useAuth } from '../auth/AuthContext';
import { getOrderById } from '../../services/orderService';
import { formatCurrency, formatQuantity, deliveryMethodLabel, shortOrderId } from '../../utils/formatters';
import { getNavItemsForRole } from '../../utils/navItemsByRole';

export default function OrderConfirmationPage() {
  const { id } = useParams();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);

  useEffect(() => {
    getOrderById(id).then(setOrder).catch(() => setOrder(null));
  }, [id]);

  return (
    <AppShell user={currentUser} navItems={getNavItemsForRole(currentUser.role)} title="Order confirmed" subtitle="Your order has been placed successfully.">
      {!order ? (
        <div className="gcash-payment-status">
          <Loader2 className="animate-spin" size={24} />
          <span>Loading your order…</span>
        </div>
      ) : (
        <section className="panel checkout-payment-step">
          <div className="checkout-payment-step-icon success"><CheckCircle2 size={28} /></div>
          <h2>Order confirmed</h2>
          <p>
            {order.farmerName
              ? `Thanks — ${order.farmerName} has been notified and will prepare your order.`
              : 'Thanks — the farmer has been notified and will prepare your order.'}
          </p>
          <div className="checkout-payment-order">Order #{shortOrderId(order.id)}</div>

          <dl className="order-confirmation-summary">
            <div>
              <dt>Product</dt>
              <dd>{order.productName}</dd>
            </div>
            <div>
              <dt>Quantity</dt>
              <dd>{formatQuantity(order.quantity)} {order.unit}</dd>
            </div>
            <div>
              <dt>Payment</dt>
              <dd><PaymentMethodLabel method={order.paymentMethod} /></dd>
            </div>
            <div>
              <dt>Delivery</dt>
              <dd>{deliveryMethodLabel(order.deliveryMethod)}</dd>
            </div>
            <div className="order-confirmation-total">
              <dt>Total</dt>
              <dd>{formatCurrency(order.totalAmount)}</dd>
            </div>
          </dl>

          <div className="form-actions">
            <button type="button" className="btn btn-primary btn-md" onClick={() => navigate(`/orders/${id}`)}>Track Order</button>
            <Link className="btn btn-secondary btn-md" to="/buyer-orders">View My Orders</Link>
          </div>
        </section>
      )}
    </AppShell>
  );
}
