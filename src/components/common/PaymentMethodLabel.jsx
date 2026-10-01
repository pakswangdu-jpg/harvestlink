import gcashLogo from '../../assets/icons/gcash-logo.png';
import { paymentLabel } from '../../utils/formatters';






export default function PaymentMethodLabel({ method, className = '' }) {
  return (
    <span className={`payment-method-label ${className}`.trim()}>
      {method === 'gcash' ? <img src={gcashLogo} alt="" className="payment-method-icon" /> : null}
      {paymentLabel(method)}
    </span>
  );
}
