import { Percent, Tag } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';

function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

// The create-flow counterpart to DiscountCalculator.jsx — that component saves live against
// an existing product's discount endpoint (see its own comment), which doesn't exist yet
// here. This one is fully controlled by ProductForm's own `values.discountPercent` and
// carries no product id, no debounce, no save call — the percent just rides along in the
// normal form submission and the backend computes/stores the same original/discounted price
// pair createProduct's applyDiscount sibling already does for an existing listing.
export default function NewProductDiscountField({ percent, onChange, price, unit }) {
  const trimmed = String(percent ?? '').trim();
  const numericPercent = trimmed === '' ? 0 : Number(trimmed);
  const isValidNumber = trimmed === '' || Number.isFinite(numericPercent);
  const isInRange = isValidNumber && numericPercent >= 0 && numericPercent <= 100;
  const basePrice = Number(price) || 0;
  const hasDiscount = isInRange && numericPercent > 0 && basePrice > 0;
  const discountAmount = hasDiscount ? round2(basePrice * (numericPercent / 100)) : 0;
  const finalPrice = hasDiscount ? round2(basePrice - discountAmount) : basePrice;

  return (
    <div className="discount-calculator">
      <div className="discount-input-wrap">
        <Percent size={15} />
        <input
          type="number"
          inputMode="decimal"
          min="0"
          max="100"
          step="0.01"
          value={percent}
          onChange={(event) => onChange(event.target.value)}
          placeholder="0"
          aria-label="Discount percent"
        />
        <span>%</span>
      </div>
      {!isInRange ? <p className="field-error">Enter a value between 0 and 100.</p> : null}

      {hasDiscount ? (
        <div className="buyer-preview-card">
          <p className="buyer-preview-heading">Buyer Price Preview</p>
          <div className="buyer-preview-body">
            <span className="buyer-preview-original">{formatCurrency(basePrice)}</span>
            <span className="buyer-preview-badge"><Tag size={12} /> {numericPercent}% OFF</span>
            <span className="buyer-preview-price">{formatCurrency(finalPrice)}{unit ? `/${unit}` : ''}</span>
          </div>
          <p className="buyer-preview-savings">You Save {formatCurrency(discountAmount)}</p>
        </div>
      ) : basePrice > 0 && trimmed !== '' ? (
        <p className="discount-calculator-status">No discount applied.</p>
      ) : null}
    </div>
  );
}
