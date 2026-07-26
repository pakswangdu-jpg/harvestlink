import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Percent, Tag } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';

// How long to wait after the farmer stops typing before the discount is actually saved —
// long enough that fast typing (e.g. "1" then "2" then "0" while typing "20") only ever
// fires one real save, short enough that it still feels instant. Every number ON SCREEN
// (discount amount, final price, profit, buyer savings) updates on every keystroke —
// only the network save itself is debounced.
const SAVE_DEBOUNCE_MS = 600;

function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function SummaryRow({ label, value, tone }) {
  const toneClass = tone ? ` discount-summary-row-${tone}` : '';
  return (
    <p className={`price-breakdown-row discount-summary-row${toneClass}`}>
      <span className="price-breakdown-label">{label}</span>
      <motion.strong key={value} initial={{ opacity: 0, y: -3 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
        {value}
      </motion.strong>
    </p>
  );
}

// Replaces the old "type a percent, click Apply Discount" control — every figure a farmer
// would want (discount amount, final price, their own profit, what the buyer sees/saves)
// now recalculates instantly on every keystroke, Shopee/Lazada-style, with no button: a
// valid percent just saves itself (debounced) in the background, and 0 removes the discount
// the same way a percent above 0 sets one, so there's no separate "applied" view to manage.
export default function DiscountCalculator({
  product, costPrice, onApplyDiscount, onRemoveDiscount,
}) {
  const [percent, setPercent] = useState(product.discountPercent != null ? String(product.discountPercent) : '');
  // Keyed to the exact percent it resulted from, so an old error/"saved" naturally stops
  // applying the instant the farmer types a different value — no explicit reset needed.
  const [saveResult, setSaveResult] = useState({ percent: null, status: 'idle', error: '' });

  const trimmed = percent.trim();
  const numericPercent = trimmed === '' ? 0 : Number(trimmed);
  const isValidNumber = trimmed === '' || Number.isFinite(numericPercent);
  const isInRange = isValidNumber && numericPercent >= 0 && numericPercent <= 100;
  // Whether the typed percent already matches what's actually persisted — derived from props/
  // state on every render rather than tracked as its own "saving" flag set inside the effect
  // below, so there's no synchronous setState in the effect body: a pending save is simply
  // "in range but not yet synced," true for the whole debounce window with no state of its own.
  const persisted = product.discountPercent || 0;
  const isSynced = isInRange && numericPercent === persisted;
  const hasError = saveResult.status === 'error' && saveResult.percent === numericPercent;

  useEffect(() => {
    if (!isInRange || isSynced) return undefined;
    const attemptPercent = numericPercent;
    const timeoutId = setTimeout(async () => {
      try {
        if (attemptPercent > 0) {
          await onApplyDiscount(attemptPercent);
        } else {
          await onRemoveDiscount();
        }
        setSaveResult({ percent: attemptPercent, status: 'saved', error: '' });
      } catch (error) {
        setSaveResult({ percent: attemptPercent, status: 'error', error: error.message || 'Could not save this discount.' });
      }
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numericPercent, isInRange, isSynced]);

  const basePrice = Number(product.originalPrice ?? product.price);
  const hasDiscount = isInRange && numericPercent > 0;
  const discountAmount = isInRange ? round2(basePrice * (numericPercent / 100)) : 0;
  const finalPrice = isInRange ? round2(basePrice - discountAmount) : basePrice;
  const cost = Number(costPrice);
  const hasCost = Number.isFinite(cost) && cost > 0;
  const estimatedProfit = hasCost ? round2(finalPrice - cost) : null;

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
          onChange={(event) => setPercent(event.target.value)}
          placeholder="0"
          aria-label="Discount percent"
        />
        <span>%</span>
      </div>
      {!isInRange ? (
        <p className="field-error">Enter a value between 0 and 100.</p>
      ) : (
        <p className="discount-calculator-status">
          {hasError ? saveResult.error : !isSynced ? 'Saving…' : saveResult.status === 'saved' ? 'Saved' : null}
        </p>
      )}

      <div className="discount-summary-card">
        <SummaryRow label="Current Price" value={`${formatCurrency(basePrice)}/${product.unit}`} />
        <SummaryRow label="Discount" value={`${isInRange ? numericPercent : 0}%`} />
        <SummaryRow label="Discount Amount" value={`-${formatCurrency(discountAmount)}`} tone="red" />
        <SummaryRow label="Final Selling Price" value={`${formatCurrency(finalPrice)}/${product.unit}`} tone="green" />
        <SummaryRow label="Estimated Cost" value={hasCost ? `${formatCurrency(cost)}/${product.unit}` : '—'} />
        <SummaryRow label="Estimated Profit" value={estimatedProfit != null ? `${formatCurrency(estimatedProfit)}/${product.unit}` : '—'} />
      </div>

      <div className="buyer-preview-card">
        <p className="buyer-preview-heading">Buyer Price Preview</p>
        <div className="buyer-preview-body">
          {hasDiscount ? <span className="buyer-preview-original">{formatCurrency(basePrice)}</span> : null}
          {hasDiscount ? (
            <span className="buyer-preview-badge"><Tag size={12} /> {numericPercent}% OFF</span>
          ) : null}
          <motion.span
            key={finalPrice}
            className="buyer-preview-price"
            initial={{ opacity: 0, y: -3 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
          >
            {formatCurrency(finalPrice)}
          </motion.span>
        </div>
        {hasDiscount ? <p className="buyer-preview-savings">You Save {formatCurrency(discountAmount)}</p> : null}
      </div>
    </div>
  );
}
