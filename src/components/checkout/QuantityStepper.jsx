import { Minus, Plus } from 'lucide-react';

// A bounded +/- stepper instead of a bare number input — the +/- buttons can never push past
// [min, max], so the only way to type an out-of-range value is by hand in the input itself
// (still allowed, so a buyer can type "2" directly instead of clicking + twice) — the caller
// is responsible for surfacing that as a validation message (see CheckoutForm.jsx, which shows
// it live, not just on submit).
export default function QuantityStepper({
  id, value, onChange, min = 0, max, step = 1, unit, disabled = false,
}) {
  const numeric = Number(value) || 0;
  const canDecrease = !disabled && numeric > min;
  const canIncrease = !disabled && (max == null || numeric < max);

  const nudge = (delta) => {
    const next = numeric + delta;
    const clamped = Math.max(min, max != null ? Math.min(max, next) : next);
    onChange(String(clamped));
  };

  return (
    <div className={`qty-stepper${disabled ? ' is-disabled' : ''}`}>
      <button
        type="button"
        onClick={() => nudge(-step)}
        disabled={!canDecrease}
        aria-label="Decrease quantity"
      >
        <Minus size={15} strokeWidth={2.5} />
      </button>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step="any"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
      />
      <button
        type="button"
        onClick={() => nudge(step)}
        disabled={!canIncrease}
        aria-label="Increase quantity"
      >
        <Plus size={15} strokeWidth={2.5} />
      </button>
      {unit ? <span className="qty-stepper-unit">{unit}</span> : null}
    </div>
  );
}
