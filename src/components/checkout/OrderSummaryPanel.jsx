import { Clock3, Loader2, MapPinned } from 'lucide-react';
import gcashLogo from '../../assets/icons/gcash-logo.png';
import Button from '../common/Button';
import SecureShieldIcon from '../icons/SecureShieldIcon';
import { formatCurrency, formatQuantity, titleCase } from '../../utils/formatters';

// The sticky right-column summary — the one place a buyer should be able to look to answer
// "what am I actually paying?" Replaces the old DeliveryFeeSummary.jsx (this was its only
// caller): same live fee-estimate data/branching, now folded into one panel alongside the
// product line item and the submit button instead of being its own disconnected card.
//
// `estimate` is `{ fee, distanceKm, durationMinutes, tierLabel, source }` (see
// backend/src/lib/deliveryFee.js) once loaded — `source: 'straight-line'` means the live
// backend call failed and the caller substituted a client-side fallback so checkout still
// shows a sensible total. For pickup, `estimate.distanceKm` is the real road distance from the
// buyer's own live location (not a fee — pickup is always free) — `locationStatus`/
// `locationNotice`/`onRetryLocation` cover the states before that location is available.
export default function OrderSummaryPanel({
  product, quantity, subtotal, deliveryMethodLabel, deliveryMunicipality,
  estimate, isLoading, error, isPickup, locationStatus, locationNotice, onRetryLocation,
  isSubmitting, isGcash,
}) {
  const fee = isPickup ? 0 : (estimate?.fee ?? 0);
  const total = subtotal + fee;
  const quantityNumber = Number(quantity) || 0;

  return (
    <aside className="checkout-summary">
      <div className="panel checkout-summary-card">
        <h2 className="checkout-summary-title">Order summary</h2>

        <div className="checkout-summary-item">
          <div className="checkout-summary-item-row">
            <span className="checkout-summary-item-name">{titleCase(product.name)}</span>
            <span className="checkout-summary-item-total">{formatCurrency(subtotal)}</span>
          </div>
          <span className="checkout-summary-item-calc">
            {quantityNumber > 0 ? `${formatQuantity(quantityNumber)} ${product.unit} × ${formatCurrency(product.price)}` : `No quantity entered yet`}
          </span>
        </div>

        <div className="checkout-summary-delivery">
          <div className="checkout-summary-delivery-label">
            <span>{deliveryMethodLabel}</span>
            {!isPickup && deliveryMunicipality ? <span className="muted">{deliveryMunicipality}</span> : null}
          </div>

          {isPickup && locationStatus === 'locating' ? (
            <p className="checkout-summary-note">
              <Loader2 size={13} className="animate-spin" aria-hidden="true" /> Detecting your location…
            </p>
          ) : null}

          {isPickup && (locationStatus === 'denied' || locationStatus === 'unsupported') && locationNotice ? (
            <div className="checkout-summary-warning">
              <span>{locationNotice}</span>
              {locationStatus === 'denied' ? (
                <button type="button" onClick={onRetryLocation}>Try again</button>
              ) : null}
            </div>
          ) : null}

          {error ? <div className="checkout-summary-warning"><span>{error}</span></div> : null}

          {isLoading && !estimate ? (
            <p className="checkout-summary-note">
              <Loader2 size={13} className="animate-spin" aria-hidden="true" /> Calculating {isPickup ? 'distance' : 'delivery fee'}…
            </p>
          ) : estimate && estimate.distanceKm > 0 ? (
            <div className="checkout-summary-line muted">
              <span><MapPinned size={13} aria-hidden="true" /> {estimate.distanceKm.toFixed(1)} km</span>
              {estimate.durationMinutes != null ? (
                <span><Clock3 size={13} aria-hidden="true" /> ~{Math.round(estimate.durationMinutes)} min</span>
              ) : null}
            </div>
          ) : null}

          <div className="checkout-summary-line">
            <span>Delivery fee</span>
            <span>{isPickup ? 'Free' : formatCurrency(fee)}</span>
          </div>
        </div>

        <div className="checkout-summary-total-row">
          <span>Total</span>
          <strong>{formatCurrency(total)}</strong>
        </div>

        <Button type="submit" className="full-width checkout-submit-btn" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              Placing order…
            </>
          ) : isGcash ? (
            <>
              <img src={gcashLogo} alt="" width={16} height={16} className="checkout-submit-btn-logo" />
              Place order — Pay with GCash
            </>
          ) : (
            'Place order — Pay on delivery'
          )}
        </Button>
        <p className="checkout-summary-security">
          <SecureShieldIcon size={15} /> Secure checkout
        </p>
      </div>
    </aside>
  );
}
