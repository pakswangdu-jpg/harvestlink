import { CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import AppShell from '../../components/layout/AppShell';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import { useAuth } from '../auth/AuthContext';
import { getOrderById } from '../../services/orderService';
import { formatCurrency, shortOrderId } from '../../utils/formatters';
import { getNavItemsForRole } from '../../utils/navItemsByRole';

export default function CodPaymentPage() {
  const { id } = useParams();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [order, setOrder] = useState(null);
  const [isLeaveDialogOpen, setIsLeaveDialogOpen] = useState(false);

  useEffect(() => {
    getOrderById(id).then(setOrder).catch(() => setOrder(null));
  }, [id]);

  return (
    <AppShell user={currentUser} navItems={getNavItemsForRole(currentUser.role)} title="Payment" subtitle="Review your payment method before confirming.">
      {!order ? (
        <div className="gcash-payment-status">
          <Loader2 className="animate-spin" size={24} />
          <span>Loading payment details…</span>
        </div>
      ) : (
        <section className="panel checkout-payment-step">
          <div className="checkout-payment-step-icon"><CheckCircle2 size={24} /></div>
          <p className="eyebrow">Cash payment</p>
          <h2>Pay on delivery</h2>
          <p>Bring <strong>{formatCurrency(order.totalAmount)}</strong> and pay the farmer when your order arrives.</p>
          <div className="checkout-payment-order">Order #{shortOrderId(order.id)}</div>
          <div className="form-actions">
            <button
              type="button"
              className="btn btn-primary btn-md"
              onClick={() => navigate(`/orders/${id}/confirmation`, {
                replace: true,
                state: { checkoutPath: location.state?.checkoutPath },
              })}
            >
              Confirm COD order
            </button>
            <button type="button" className="btn btn-secondary btn-md" onClick={() => setIsLeaveDialogOpen(true)}>
              Back to Order
            </button>
          </div>
          <p className="checkout-summary-security"><ShieldCheck size={15} /> Secure checkout</p>
        </section>
      )}

      <ConfirmDialog
        open={isLeaveDialogOpen}
        title="Leave this payment step?"
        message="Your order is still waiting for confirmation. You can come back to this page anytime from your order details."
        confirmLabel="Leave Page"
        cancelLabel="Stay"
        onConfirm={() => navigate(`/orders/${id}`)}
        onCancel={() => setIsLeaveDialogOpen(false)}
      />
    </AppShell>
  );
}
