import gcashLogo from '../../assets/icons/gcash-logo.png';
import { paymentLabel } from '../../utils/formatters';

// The one place every "payment method" cell across the app (buyer/farmer/admin order
// tables, order tracking, receipts) resolves its display — a GCash order always shows the
// real GCash mark instead of just the word "GCash", so it reads at a glance the same way it
// does on the actual GCash checkout page (see GcashPaymentPage.jsx, which uses this same
// asset).
export default function PaymentMethodLabel({ method, className = '' }) {
  return (
    <span className={`payment-method-label ${className}`.trim()}>
      {method === 'gcash' ? <img src={gcashLogo} alt="" className="payment-method-icon" /> : null}
      {paymentLabel(method)}
    </span>
  );
}
