import { Check } from 'lucide-react';

const STEPS = [
  { key: 'checkout', label: 'Checkout' },
  { key: 'payment', label: 'Payment' },
  { key: 'confirmation', label: 'Confirmation' },
];

// Purely presentational — `currentStep` is one of STEPS' keys. A step before the current one
// renders as done (a small check), the current one is the only "active" (green) one, and
// everything after is still neutral. Deliberately compact (no connecting-line animation, no
// oversized circles) — this is a wayfinding cue above the page heading, not a hero element.
export default function CheckoutProgress({ currentStep = 'checkout' }) {
  const currentIndex = STEPS.findIndex((step) => step.key === currentStep);

  return (
    <ol className="checkout-progress" aria-label="Checkout progress">
      {STEPS.map((step, index) => {
        const isDone = index < currentIndex;
        const isActive = index === currentIndex;
        return (
          <li
            key={step.key}
            className={`checkout-progress-step${isActive ? ' is-active' : ''}${isDone ? ' is-done' : ''}`}
            aria-current={isActive ? 'step' : undefined}
          >
            <span className="checkout-progress-marker">{isDone ? <Check size={12} strokeWidth={3} /> : index + 1}</span>
            <span className="checkout-progress-label">{step.label}</span>
            {index < STEPS.length - 1 ? <span className="checkout-progress-connector" aria-hidden="true" /> : null}
          </li>
        );
      })}
    </ol>
  );
}
