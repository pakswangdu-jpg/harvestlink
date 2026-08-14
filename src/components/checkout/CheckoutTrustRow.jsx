import { HeartHandshake, LifeBuoy, ShieldCheck, Sprout } from 'lucide-react';

const TRUST_ITEMS = [
  { icon: Sprout, title: 'Fresh from local farms', text: 'Quality produce you can trust' },
  { icon: ShieldCheck, title: 'Safe & secure payments', text: 'Your transactions are protected' },
  { icon: HeartHandshake, title: 'Support local farmers', text: 'Every purchase makes a difference' },
  { icon: LifeBuoy, title: 'Need help?', text: 'Contact our support anytime' },
];

// Four small facts, not a marketing banner — sits at the very bottom of checkout, below both
// the form and the order summary (see CheckoutForm.jsx), spanning the full width.
export default function CheckoutTrustRow() {
  return (
    <div className="panel checkout-trust-row">
      {TRUST_ITEMS.map(({ icon: Icon, title, text }) => (
        <div className="checkout-trust-item" key={title}>
          <span className="checkout-trust-icon" aria-hidden="true">
            <Icon size={16} strokeWidth={2} />
          </span>
          <div>
            <p className="checkout-trust-title">{title}</p>
            <p className="checkout-trust-text">{text}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
