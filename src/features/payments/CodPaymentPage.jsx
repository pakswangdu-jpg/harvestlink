import { Banknote, Loader2, ShieldCheck } from 'lucide-react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import AppShell from '../../components/layout/AppShell';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import smartphoneCashIcon from '../../assets/icons/smartphone-cash.png';
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
  const [isCashReminderOpen, setIsCashReminderOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getOrderById(id).then((result) => {
      if (cancelled) return;
      setOrder(result);
      setIsCashReminderOpen(result.paymentMethod === 'cod');
    }).catch(() => {
      if (!cancelled) setOrder(null);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <AppShell
      user={currentUser}
      navItems={getNavItemsForRole(currentUser.role)}
      title="Payment"
      subtitle="Review your payment method before confirming."
      pageClassName="cod-payment-page"
    >
      {!order ? (
        <div className="gcash-payment-status">
          <Loader2 className="animate-spin" size={24} />
          <span>Loading payment details…</span>
        </div>
      ) : (
        <section className="panel checkout-payment-step cod-payment-step">
          <header className="cod-payment-header">
            <div className="checkout-payment-step-icon">
              <img src={smartphoneCashIcon} alt="" />
            </div>
            <p className="eyebrow">Cash on Delivery</p>
            <h2>Pay on delivery</h2>
            <p>Pay the farmer in cash when your order arrives.</p>
          </header>

          <div className="cod-payment-details">
            <div className="cod-payment-amount">
              <span>Amount to bring</span>
              <strong>{formatCurrency(order.totalAmount)}</strong>
            </div>
            <div className="checkout-payment-order">Order #{shortOrderId(order.id)}</div>
          </div>

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

      {isCashReminderOpen && order?.paymentMethod === 'cod' ? (
        <div
          className="cod-cash-reminder-overlay"
          onClick={() => setIsCashReminderOpen(false)}
        >
          <section
            className="cod-cash-reminder-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cod-cash-reminder-title"
            aria-describedby="cod-cash-reminder-description"
            onClick={(event) => event.stopPropagation()}
          >
            <span className="cod-cash-reminder-icon" aria-hidden="true">
              <Banknote size={23} />
            </span>
            <h2 id="cod-cash-reminder-title">Please prepare exact cash</h2>
            <p id="cod-cash-reminder-description">
              Have <strong>{formatCurrency(order.totalAmount)}</strong> ready to pay when your order is delivered or picked up.
            </p>
            <button
              type="button"
              className="btn btn-primary btn-md"
              onClick={() => setIsCashReminderOpen(false)}
            >
              Got it
            </button>
          </section>
        </div>
      ) : null}
    </AppShell>
  );
}
