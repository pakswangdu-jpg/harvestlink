import { Minus, Plus } from 'lucide-react';






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
