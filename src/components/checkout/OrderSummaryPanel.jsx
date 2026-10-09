import { Clock3, Loader2, MapPinned, Truck } from 'lucide-react';
import gcashLogo from '../../assets/icons/gcash-logo.png';
import lalamoveLogo from '../../assets/icons/lalamove-logo.png';
import buyerPickupIcon from '../../assets/icons/buyer-pickup-icon.png';
import Button from '../common/Button';
import SecureShieldIcon from '../icons/SecureShieldIcon';
import {
  formatCurrency, formatQuantity, paymentLabel, titleCase,
} from '../../utils/formatters';




const DELIVERY_METHOD_LOGOS = {
  buyer_pickup: buyerPickupIcon,
  courier: lalamoveLogo,
};












export default function OrderSummaryPanel({
  product, quantity, unitPrice, isWholesalePrice, subtotal, deliveryMethod, deliveryMethodLabel, deliveryMunicipality,
  estimate, isLoading, error, isPickup, locationStatus, locationNotice, onRetryLocation,
  isSubmitting, orderPlaced, isGcash, paymentMethod,
  quote, isReviewed, onReview, onRetryQuote,
}) {
  const fee = isPickup ? 0 : (estimate?.fee ?? 0);
  const total = quote?.total ?? subtotal + fee;
  const quantityNumber = Number(quantity) || 0;
  const deliveryLogo = DELIVERY_METHOD_LOGOS[deliveryMethod];

  return (
    <aside className="checkout-summary">
      <div className="panel checkout-summary-card">
        <h2 className="checkout-summary-title">Review order</h2>

        <div className="checkout-summary-item">
          <div className="checkout-summary-item-row">
            <span className="checkout-summary-item-name">{titleCase(product.name)}</span>
            <span className="checkout-summary-item-total">{formatCurrency(subtotal)}</span>
          </div>
          <span className="checkout-summary-item-calc">
            {quantityNumber > 0 ? `${formatQuantity(quantityNumber)} ${product.unit} × ${formatCurrency(unitPrice)}` : `No quantity entered yet`}
          </span>
          {quantityNumber > 0 && isWholesalePrice ? (
            <span className="checkout-summary-wholesale-note">Wholesale price applied</span>
          ) : null}
        </div>

        <div className="checkout-summary-line"><span>Subtotal before savings</span><span>{quote ? formatCurrency(quote.retailSubtotal) : '--'}</span></div>
        <div className="checkout-summary-line"><span>Discount / wholesale savings</span><span>{quote ? formatCurrency(quote.discount) : '--'}</span></div>
        <div className="checkout-summary-line"><span>Subtotal</span><span>{quote ? formatCurrency(quote.subtotal) : '--'}</span></div>

        <div className="checkout-summary-delivery">
          <div className="checkout-summary-delivery-label">
            <span className="checkout-summary-delivery-method">
              {deliveryLogo ? (
                <img src={deliveryLogo} alt="" width={16} height={16} className="checkout-summary-delivery-icon" />
              ) : deliveryMethod === 'farmer_delivery' ? (
                <Truck size={15} className="checkout-summary-delivery-icon" aria-hidden="true" />
              ) : null}
              {deliveryMethodLabel}
            </span>
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

          {error ? <div className="checkout-summary-warning" role="alert"><span>{error}</span>{onRetryQuote ? <button type="button" onClick={onRetryQuote}>Refresh total</button> : null}</div> : null}

          {isLoading && !estimate ? (
            <p className="checkout-summary-note">
              <Loader2 size={13} className="animate-spin" aria-hidden="true" /> Calculating {isPickup ? 'distance' : 'delivery fee'}…
            </p>
          ) : estimate && estimate.distanceKm > 0 ? (
            <div className="checkout-summary-line muted">
              <span><MapPinned size={13} aria-hidden="true" /> {estimate.distanceKm.toFixed(1)} km</span>
              {

                                                                                }
              {!isPickup && estimate.durationMinutes != null ? (
                <span><Clock3 size={13} aria-hidden="true" /> ~{Math.round(estimate.durationMinutes)} min</span>
              ) : null}
            </div>
          ) : null}

          <div className="checkout-summary-line">
            <span>Delivery fee</span>
            <span>{isPickup ? 'Free' : quote ? formatCurrency(fee) : '--'}</span>
          </div>
        </div>

        <div className="checkout-summary-total-row checkout-summary-payment-row">
          <span className="checkout-summary-payment-label">Payment method</span>
          <strong className="checkout-summary-payment-value">{paymentLabel(paymentMethod)}</strong>
        </div>

        <div className="checkout-summary-total-row">
          <span>Total</span>
          <strong>{quote ? formatCurrency(total) : '--'}</strong>
        </div>

        <label className="checkout-review-check"><input type="checkbox" checked={Boolean(isReviewed)} onChange={(event) => onReview(event.target.checked)} disabled={!quote || isSubmitting || orderPlaced} /><span>I have reviewed the items, delivery, payment method, and total.</span></label>
        <Button type="submit" className="full-width checkout-submit-btn" disabled={isSubmitting || orderPlaced || !quote || !isReviewed}>
          {isSubmitting ? (
            <>
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              Placing order…
            </>
          ) : orderPlaced ? (
            'Order placed'
          ) : isGcash ? (
            <>
              <img src={gcashLogo} alt="" width={16} height={16} className="checkout-submit-btn-logo" />
              Place order
            </>
          ) : (
            'Place order'
          )}
        </Button>
        <p className="checkout-summary-security">
          <SecureShieldIcon size={15} /> Secure checkout
        </p>
      </div>
    </aside>
  );
}
