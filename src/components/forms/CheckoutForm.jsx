import { useEffect, useState } from 'react';
import {
  Banknote, Check, MapPin, Truck,
} from 'lucide-react';
import gcashLogo from '../../assets/icons/gcash-logo.png';
import lalamoveLogo from '../../assets/icons/lalamove-logo.png';
import buyerPickupIcon from '../../assets/icons/buyer-pickup-icon.png';
import FormField from '../common/FormField';
import CheckoutProductCard from '../checkout/CheckoutProductCard';
import QuantityStepper from '../checkout/QuantityStepper';
import OrderSummaryPanel from '../checkout/OrderSummaryPanel';
import CheckoutTrustRow from '../checkout/CheckoutTrustRow';
import { CEBU_MUNICIPALITIES, DELIVERY_METHODS, PAYMENT_METHODS, getMunicipalityCoords, matchMunicipality } from '../../utils/constants';
import { estimateDeliveryFee, haversineKm } from '../../utils/geo';
import { getDeliveryFeeEstimate } from '../../services/deliveryFeeService';
import { getLalamoveQuote } from '../../services/lalamoveService';
import { hasErrors, validateCheckoutForm } from '../../utils/validators';
import { formatQuantity } from '../../utils/formatters';

const MESSAGE_MAX_LENGTH = 200;

// Farmer delivery keeps a plain lucide icon; buyer pickup and courier both get their own
// image assets (buyer-pickup-icon.png / lalamove-logo.png) instead of a lucide stand-in —
// rendered separately below since one's a component and the other's an <img src>, same
// split as the payment method icons.
const DELIVERY_METHOD_ICONS = {
  farmer_delivery: Truck,
};

// COD gets a plain lucide icon; GCash gets its real logo image (gcash-com-logo.png) instead
// of a lucide stand-in — rendered separately below since one's a component and the other's
// an <img src>.
const PAYMENT_METHOD_ICONS = {
  cod: Banknote,
};

// One-line explanation shown under each option's label — the DELIVERY_METHODS/PAYMENT_METHODS
// labels themselves ("Farmer delivery", "COD") stay short since they're reused elsewhere
// (order tables, receipts), so the fuller "what does this actually mean" copy lives here,
// local to this one selector.
const DELIVERY_METHOD_DESCRIPTIONS = {
  farmer_delivery: 'The farmer delivers to your address',
  buyer_pickup: "Pick up directly from the farmer's location",
  courier: 'Delivered by a Lalamove rider',
};

const PAYMENT_METHOD_DESCRIPTIONS = {
  cod: 'Pay in cash when your order arrives',
  gcash: 'Pay the farmer directly with GCash',
};

// Used only if the live backend estimate (Smart Distance-Based Delivery Fee System — see
// backend/src/lib/deliveryFee.js) fails to load, e.g. a network blip — a straight-line
// distance and the old flat per-km formula, clearly not the real tiered pricing, just enough
// to keep checkout usable and honest about it (see the warning in OrderSummaryPanel.jsx)
// rather than blocking the buyer entirely.
function buildFallbackEstimate(originMunicipality, deliveryMunicipality) {
  return {
    fee: estimateDeliveryFee(originMunicipality, deliveryMunicipality, 'farmer_delivery'),
    distanceKm: haversineKm(getMunicipalityCoords(originMunicipality), getMunicipalityCoords(deliveryMunicipality)),
    durationMinutes: null,
    tierLabel: 'Estimated',
    source: 'straight-line',
  };
}

// Same "keep checkout usable if the live backend call itself fails" reasoning as
// buildFallbackEstimate above, just for pickup: a straight-line distance from the buyer's
// real (already-granted) live location to the farm, instead of no distance at all.
function buildPickupFallbackEstimate(originMunicipality, buyerCoords) {
  return {
    fee: 0,
    distanceKm: haversineKm(buyerCoords, getMunicipalityCoords(originMunicipality)),
    durationMinutes: null,
    tierLabel: 'Pickup',
    source: 'straight-line',
  };
}

// A real, in-range starting quantity instead of an empty field with a misleading placeholder
// — the old `placeholder="25"` looked like a real value sitting in an empty input, which is
// exactly why the subtotal showed ₱0.00 next to what looked like a quantity. Wholesale starts
// at its minimum order; everything else starts at 1 — both capped to what's actually in stock,
// so the very first render can never show an impossible order.
function defaultQuantity(product, initialQuantity) {
  if (initialQuantity) return initialQuantity;
  const stock = Number(product.quantity) || 0;
  if (stock <= 0) return '';
  const floor = product.sellingType === 'wholesale' && product.moq ? Number(product.moq) : 1;
  return String(Math.min(floor, stock));
}

export default function CheckoutForm({
  product, currentUser, onSubmit, initialQuantity = '', orderPlaced = false,
}) {
  const [values, setValues] = useState(() => ({
    quantity: defaultQuantity(product, initialQuantity),
    message: '',
    paymentMethod: 'cod',
    deliveryMethod: 'farmer_delivery',
    deliveryMunicipality: currentUser.municipality || CEBU_MUNICIPALITIES[0],
  }));
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const originMunicipality = matchMunicipality(product.location);
  const isPickup = values.deliveryMethod === 'buyer_pickup';
  const isCourier = values.deliveryMethod === 'courier';
  const stock = Number(product.quantity) || 0;

  const [feeEstimate, setFeeEstimate] = useState(null);
  const [isEstimating, setIsEstimating] = useState(false);
  const [estimateError, setEstimateError] = useState('');

  // Pickup has no delivery fee, but the buyer still benefits from knowing exactly how far
  // the farm is from wherever they actually are right now — 'idle' | 'locating' | 'granted'
  // | 'denied' | 'unsupported'. Requested fresh each time pickup is selected (not persisted
  // from the profile) since a saved address can go stale but a live GPS reading can't.
  const [buyerCoords, setBuyerCoords] = useState(null);
  const [locationStatus, setLocationStatus] = useState('idle');
  const [locationNotice, setLocationNotice] = useState('');

  const requestBuyerLocation = () => {
    if (!navigator.geolocation) {
      setLocationStatus('unsupported');
      setLocationNotice('Location access is not supported on this device.');
      return;
    }
    setLocationStatus('locating');
    setLocationNotice('');

    // Belt-and-suspenders on top of the `timeout` option below — some browser/OS
    // combinations (notably Chrome on Windows with system Location Services turned off)
    // never invoke either getCurrentPosition callback at all, which used to leave this
    // stuck on "Detecting your location…" forever with no way out. This guarantees the UI
    // always lands on an actionable state (with a "Try again" button, via
    // OrderSummaryPanel's onRetryLocation) shortly after the API's own deadline, even if
    // the browser itself never calls back.
    let settled = false;
    const watchdog = setTimeout(() => {
      if (settled) return;
      settled = true;
      setLocationStatus('denied');
      setLocationNotice('Location detection timed out. Check that location services are turned on for your browser and device, then try again.');
    }, 12000);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (settled) return;
        settled = true;
        clearTimeout(watchdog);
        setBuyerCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
        setLocationStatus('granted');
      },
      (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(watchdog);
        setLocationStatus('denied');
        setLocationNotice(
          error.code === error.PERMISSION_DENIED
            ? 'Location access was denied — enable it in your browser to see the real distance to the farm.'
            : 'Unable to detect your location right now.'
        );
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Auto-requests once, the first time the buyer switches to pickup — not on every render,
  // and not re-prompted just because other fields change while pickup stays selected.
  useEffect(() => {
    if (isPickup && locationStatus === 'idle') requestBuyerLocation();
  }, [isPickup, locationStatus]);

  // Instantly recalculates distance/ETA/fee whenever the buyer changes delivery method,
  // municipality, or (for pickup) once their live location comes through — no page refresh,
  // no "recalculate" button.
  useEffect(() => {
    if (isPickup && !buyerCoords) {
      // Still locating, denied, or unsupported — nothing real to estimate yet.
      setFeeEstimate(null);
      setEstimateError('');
      return undefined;
    }

    let cancelled = false;
    setIsEstimating(true);
    setEstimateError('');

    // Courier gets a real Lalamove quotation instead of the generic road-distance fee
    // formula farmer_delivery/buyer_pickup use — see lalamoveService.js. No fallback estimate
    // on failure here (unlike the other two methods below): a made-up number next to the
    // Lalamove logo would misrepresent it as a real quote from Lalamove specifically.
    if (isCourier) {
      getLalamoveQuote(product.id, values.deliveryMunicipality)
        .then((result) => {
          if (cancelled) return;
          setFeeEstimate({
            fee: result.fee,
            distanceKm: result.distanceKm,
            durationMinutes: result.durationMinutes,
            tierLabel: 'Lalamove',
            source: 'lalamove',
            quotationId: result.quotationId,
          });
        })
        .catch(() => {
          if (cancelled) return;
          setEstimateError('Delivery quotation unavailable. Please try again.');
          setFeeEstimate(null);
        })
        .finally(() => {
          if (!cancelled) setIsEstimating(false);
        });

      return () => {
        cancelled = true;
      };
    }

    getDeliveryFeeEstimate({
      originMunicipality,
      deliveryMunicipality: isPickup ? undefined : values.deliveryMunicipality,
      deliveryMethod: values.deliveryMethod,
      buyerLat: isPickup ? buyerCoords.lat : undefined,
      buyerLng: isPickup ? buyerCoords.lng : undefined,
    })
      .then((result) => {
        if (cancelled) return;
        setFeeEstimate(result);
      })
      .catch(() => {
        if (cancelled) return;
        setEstimateError(
          isPickup
            ? 'Could not calculate the distance to the farm — showing a rough estimate instead.'
            : 'Could not reach the delivery pricing service — showing a rough estimate instead.'
        );
        setFeeEstimate(
          isPickup
            ? buildPickupFallbackEstimate(originMunicipality, buyerCoords)
            : buildFallbackEstimate(originMunicipality, values.deliveryMunicipality)
        );
      })
      .finally(() => {
        if (!cancelled) setIsEstimating(false);
      });

    return () => {
      cancelled = true;
    };
  }, [originMunicipality, values.deliveryMunicipality, values.deliveryMethod, isPickup, isCourier, buyerCoords, product.id]);

  const updateField = (field, value) => {
    setValues((previous) => ({ ...previous, [field]: value }));
    setErrors((previous) => ({ ...previous, [field]: undefined, form: undefined }));
  };

  const quantityNumber = Number(values.quantity) || 0;
  const subtotal = quantityNumber * Number(product.price);
  const isGcash = values.paymentMethod === 'gcash';
  const deliveryMethodLabel = DELIVERY_METHODS.find((method) => method.value === values.deliveryMethod)?.label || '';

  // Live, not just on submit — the moment a typed quantity exceeds real stock, the field
  // shows it immediately (see FormField's error prop below) instead of waiting for a submit
  // attempt to reveal an order that was never going to be accepted.
  const liveQuantityError = quantityNumber > stock ? `Only ${formatQuantity(stock)} ${product.unit} available.` : null;

  // The order is created immediately either way — for GCash, the caller (ProductDetails.jsx)
  // routes the buyer on to the dedicated GCash payment page (src/features/payments/
  // GcashPaymentPage.jsx) afterward instead of straight to order tracking; that page is what
  // actually collects "payment" and marks the order paid.
  const handleSubmit = async (event) => {
    event.preventDefault();
    const nextErrors = validateCheckoutForm(values, product, currentUser);
    if (hasErrors(nextErrors)) {
      setErrors(nextErrors);
      return;
    }
    setIsSubmitting(true);
    try {
      await onSubmit(values);
      setIsSubmitting(false);
    } catch (error) {
      setErrors((previous) => ({ ...previous, form: error.message }));
      setIsSubmitting(false);
    }
  };

  return (
    <form className="checkout-grid" onSubmit={handleSubmit}>
      <div className="checkout-main">
        <CheckoutProductCard product={product} />

        <div className="panel checkout-section">
          <h2 className="checkout-section-title">Order details</h2>

          {errors.form ? <div className="form-alert error">{errors.form}</div> : null}

          <div className="form-stack">
            <FormField
              label="Quantity"
              name="quantity"
              error={errors.quantity || liveQuantityError}
              helper={
                product.sellingType === 'wholesale' && product.moq
                  ? `Maximum available: ${formatQuantity(stock)} ${product.unit} · Wholesale minimum ${formatQuantity(product.moq)} ${product.unit}`
                  : `Maximum available: ${formatQuantity(stock)} ${product.unit}`
              }
            >
              <QuantityStepper
                id="quantity"
                value={values.quantity}
                onChange={(value) => updateField('quantity', value)}
                min={0}
                max={stock}
                unit={product.unit}
              />
            </FormField>

            <FormField label="Delivery method" name="deliveryMethod" error={errors.deliveryMethod}>
              <div className="method-card-group three" role="radiogroup" aria-label="Delivery method">
                {DELIVERY_METHODS.map((method) => {
                  const Icon = DELIVERY_METHOD_ICONS[method.value];
                  const isSelected = values.deliveryMethod === method.value;
                  return (
                    <button
                      key={method.value}
                      type="button"
                      className={`method-card method-card-${method.value}${isSelected ? ' is-selected' : ''}`}
                      aria-pressed={isSelected}
                      onClick={() => updateField('deliveryMethod', method.value)}
                    >
                      {isSelected ? <span className="method-card-check"><Check size={11} strokeWidth={3} /></span> : null}
                      {method.value === 'courier' ? (
                        <img src={lalamoveLogo} alt="" width={20} height={20} className="method-card-icon method-card-icon-logo" />
                      ) : method.value === 'buyer_pickup' ? (
                        <img src={buyerPickupIcon} alt="" width={20} height={20} className="method-card-icon method-card-icon-logo" />
                      ) : (
                        <Icon size={20} strokeWidth={1.75} className="method-card-icon" aria-hidden="true" />
                      )}
                      <span className="method-card-label">{method.label}</span>
                      <span className="method-card-description">{DELIVERY_METHOD_DESCRIPTIONS[method.value]}</span>
                    </button>
                  );
                })}
              </div>
            </FormField>

            {!isPickup ? (
              <FormField label="Deliver to (municipality)" name="deliveryMunicipality" error={errors.deliveryMunicipality}>
                <div className="select-with-icon">
                  <MapPin size={16} className="select-with-icon-icon" aria-hidden="true" />
                  <select
                    id="deliveryMunicipality"
                    value={values.deliveryMunicipality}
                    onChange={(event) => updateField('deliveryMunicipality', event.target.value)}
                  >
                    {CEBU_MUNICIPALITIES.map((municipality) => <option key={municipality}>{municipality}</option>)}
                  </select>
                </div>
              </FormField>
            ) : null}

            <FormField label="Payment method" name="paymentMethod" error={errors.paymentMethod}>
              <div className="method-card-group two" role="radiogroup" aria-label="Payment method">
                {PAYMENT_METHODS.map((method) => {
                  const Icon = PAYMENT_METHOD_ICONS[method.value];
                  const isSelected = values.paymentMethod === method.value;
                  return (
                    <button
                      key={method.value}
                      type="button"
                      className={`method-card${isSelected ? ' is-selected' : ''}`}
                      aria-pressed={isSelected}
                      onClick={() => updateField('paymentMethod', method.value)}
                    >
                      {isSelected ? <span className="method-card-check"><Check size={11} strokeWidth={3} /></span> : null}
                      {method.value === 'gcash' ? (
                        <img src={gcashLogo} alt="" width={20} height={20} className="method-card-icon method-card-icon-logo" />
                      ) : (
                        <Icon size={20} strokeWidth={1.75} className="method-card-icon" aria-hidden="true" />
                      )}
                      <span className="method-card-label">{method.label}</span>
                      <span className="method-card-description">{PAYMENT_METHOD_DESCRIPTIONS[method.value]}</span>
                    </button>
                  );
                })}
              </div>
              {isGcash ? (
                <p className="payment-method-notice">You will pay the farmer directly using your GCash account.</p>
              ) : null}
            </FormField>

            <FormField
              label="Message to farmer (optional)"
              name="message"
              helper="Add any pickup, delivery, or timing notes for the farmer."
            >
              <div className="textarea-with-counter">
                <textarea
                  id="message"
                  rows="4"
                  maxLength={MESSAGE_MAX_LENGTH}
                  value={values.message}
                  onChange={(event) => updateField('message', event.target.value)}
                  placeholder="Can we pick this up tomorrow morning?"
                />
                <span className="textarea-counter">{values.message.length} / {MESSAGE_MAX_LENGTH}</span>
              </div>
            </FormField>
          </div>
        </div>
      </div>

      <OrderSummaryPanel
        product={product}
        quantity={values.quantity}
        subtotal={subtotal}
        deliveryMethodLabel={deliveryMethodLabel}
        deliveryMunicipality={!isPickup ? values.deliveryMunicipality : null}
        estimate={feeEstimate}
        isLoading={isEstimating}
        error={estimateError}
        isPickup={isPickup}
        locationStatus={locationStatus}
        locationNotice={locationNotice}
        onRetryLocation={requestBuyerLocation}
        isSubmitting={isSubmitting}
        orderPlaced={orderPlaced}
        isGcash={isGcash}
      />

      <CheckoutTrustRow />
    </form>
  );
}
