import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Printer } from 'lucide-react';
import AppShell from '../../components/layout/AppShell';
import Button from '../../components/common/Button';
import { useAuth } from '../auth/AuthContext';
import { getOrderById } from '../../services/orderService';
import {
  deliveryMethodLabel,
  formatCurrency,
  formatDate,
  paymentLabel,
  paymentStatusLabel,
  shortOrderId,
} from '../../utils/formatters';
import { getNavItemsForRole } from '../../utils/navItemsByRole';

function fallbackOrdersPath(role) {
  if (role === 'farmer') return '/farmer-orders';
  if (role === 'stakeholder') return '/stakeholder-orders';
  return '/buyer-orders';
}

export default function OrderReceipt() {
  const { id } = useParams();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [loadedId, setLoadedId] = useState(null);

  useEffect(() => {
    let cancelled = false;
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
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loadedId !== id) return null;
  if (!order) return <Navigate to={fallbackOrdersPath(currentUser.role)} replace />;

  // "Buyer" here means "the account that placed this order" — a partner organization
  // checking out through the marketplace is just as much the buyer as a buyer-role
  // account is, so this checks id ownership, not the literal account role.
  const isBuyer = currentUser.id === order.buyerId;
  const isFarmer = currentUser.role === 'farmer' && currentUser.id === order.farmerId;
  if (!isBuyer && !isFarmer) return <Navigate to={fallbackOrdersPath(currentUser.role)} replace />;

  const navItems = getNavItemsForRole(currentUser.role);
  const subtotal = order.unitPrice * order.quantity;

  return (
    <AppShell user={currentUser} navItems={navItems} title="Receipt" subtitle={`Order #${shortOrderId(order.id)}`}>
      <section className="panel receipt-panel">
        <div className="receipt-header">
          <div>
            <strong>HarvestLink</strong>
            <p className="muted">Cebu Farm-to-Market</p>
          </div>
          <div className="receipt-meta">
            <p><span>Order #</span><strong>{shortOrderId(order.id)}</strong></p>
            <p><span>Date</span><strong>{formatDate(order.createdAt)}</strong></p>
          </div>
        </div>

        <div className="receipt-parties">
          <div><span>Buyer</span><strong>{order.buyerName}</strong></div>
          <div><span>Farmer</span><strong>{order.farmerName}</strong></div>
        </div>

        <table className="receipt-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Qty</th>
              <th>Unit price</th>
              <th>Subtotal</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{order.productName}</td>
              <td>{order.quantity} {order.unit}</td>
              <td>{formatCurrency(order.unitPrice)}</td>
              <td>{formatCurrency(subtotal)}</td>
            </tr>
          </tbody>
        </table>

        <div className="receipt-totals">
          <div><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
          <div>
            <span>
              Delivery fee{order.deliveryFeeTier ? ` (${order.deliveryFeeTier})` : ''}
            </span>
            <span>{formatCurrency(order.deliveryFee)}</span>
          </div>
          <div className="receipt-total-line"><span>Total</span><strong>{formatCurrency(order.totalAmount)}</strong></div>
        </div>

        <div className="receipt-parties">
          <div><span>Payment method</span><strong>{paymentLabel(order.paymentMethod)}</strong></div>
          <div><span>Payment status</span><strong>{paymentStatusLabel(order.paymentStatus)}</strong></div>
          <div><span>Delivery method</span><strong>{deliveryMethodLabel(order.deliveryMethod)}</strong></div>
          {order.deliveryDistanceKm ? (
            <div><span>Delivery distance</span><strong>{order.deliveryDistanceKm.toFixed(1)} km</strong></div>
          ) : null}
          {order.transactionId ? (
            <div><span>GCash transaction ID</span><strong>{order.transactionId}</strong></div>
          ) : null}
        </div>

        <p className="receipt-footer muted">Thank you for supporting local Cebu farmers.</p>

        <div className="form-actions receipt-actions">
          <Button variant="secondary" onClick={() => navigate(`/orders/${order.id}`)}>Back to order</Button>
          <Button onClick={() => window.print()}><Printer size={15} /> Print receipt</Button>
        </div>
      </section>
    </AppShell>
  );
}
