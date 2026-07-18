import { useEffect, useState } from 'react';
import Button from '../common/Button';
import FormField from '../common/FormField';
import DeliveryFeeSummary from '../checkout/DeliveryFeeSummary';
import { CEBU_MUNICIPALITIES, DELIVERY_METHODS, PAYMENT_METHODS, getMunicipalityCoords, matchMunicipality } from '../../utils/constants';
import { estimateDeliveryFee, haversineKm } from '../../utils/geo';
import { getDeliveryFeeEstimate } from '../../services/deliveryFeeService';
import { hasErrors, validateCheckoutForm } from '../../utils/validators';

// Used only if the live backend estimate (Smart Distance-Based Delivery Fee System — see
// backend/src/lib/deliveryFee.js) fails to load, e.g. a network blip — a straight-line
// distance and the old flat per-km formula, clearly not the real tiered pricing, just enough
// to keep checkout usable and honest about it (see the warning banner in
// DeliveryFeeSummary.jsx) rather than blocking the buyer entirely.
function buildFallbackEstimate(originMunicipality, deliveryMunicipality) {
  return {
    fee: estimateDeliveryFee(originMunicipality, deliveryMunicipality, 'farmer_delivery'),
    distanceKm: haversineKm(getMunicipalityCoords(originMunicipality), getMunicipalityCoords(deliveryMunicipality)),
    durationMinutes: null,
    tierLabel: 'Estimated',
    source: 'straight-line',
  };
}

export default function CheckoutForm({ product, currentUser, onSubmit }) {
  const [values, setValues] = useState(() => ({
    quantity: '',
    message: '',
    paymentMethod: 'cod',
    deliveryMethod: 'farmer_delivery',
    deliveryMunicipality: currentUser.municipality || CEBU_MUNICIPALITIES[0],
  }));
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const originMunicipality = matchMunicipality(product.location);
  const isPickup = values.deliveryMethod === 'buyer_pickup';

  const [feeEstimate, setFeeEstimate] = useState(null);
  const [isEstimating, setIsEstimating] = useState(false);
  const [estimateError, setEstimateError] = useState('');

  // Instantly recalculates distance/ETA/fee whenever the buyer changes delivery method or
  // municipality — no page refresh, no "recalculate" button. Skipped entirely for pickup,
  // which has no delivery leg to price.
  useEffect(() => {
    if (isPickup) {
      setFeeEstimate(null);
      setEstimateError('');
      return undefined;
    }

    let cancelled = false;
    setIsEstimating(true);
    setEstimateError('');
    getDeliveryFeeEstimate({
      originMunicipality,
      deliveryMunicipality: values.deliveryMunicipality,
      deliveryMethod: values.deliveryMethod,
    })
      .then((result) => {
        if (cancelled) return;
        setFeeEstimate(result);
      })
      .catch(() => {
        if (cancelled) return;
        setEstimateError('Could not reach the delivery pricing service — showing a rough estimate instead.');
        setFeeEstimate(buildFallbackEstimate(originMunicipality, values.deliveryMunicipality));
      })
      .finally(() => {
        if (!cancelled) setIsEstimating(false);
      });

    return () => {
      cancelled = true;
    };
  }, [originMunicipality, values.deliveryMunicipality, values.deliveryMethod, isPickup]);

  const updateField = (field, value) => {
    setValues((previous) => ({ ...previous, [field]: value }));
    setErrors((previous) => ({ ...previous, [field]: undefined, form: undefined }));
  };

  const subtotal = (Number(values.quantity) || 0) * Number(product.price);
  const isGcash = values.paymentMethod === 'gcash';

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
      // No setIsSubmitting(false) on success — the caller navigates away on success, so
      // resetting here would just re-enable the button for the instant before that happens.
    } catch (error) {
      setErrors((previous) => ({ ...previous, form: error.message }));
      setIsSubmitting(false);
    }
  };

  return (
    <form className="form-stack" onSubmit={handleSubmit}>
      {errors.form ? <div className="form-alert error">{errors.form}</div> : null}

      <FormField
        label="Quantity requested"
        name="quantity"
        error={errors.quantity}
        helper={
          product.sellingType === 'bulk' && product.bulkMinQuantity
            ? `${product.quantity} ${product.unit} available — bulk listing, minimum order ${product.bulkMinQuantity} ${product.unit}`
            : `${product.quantity} ${product.unit} available`
        }
      >
        <input
          id="quantity"
          type="number"
          min="0"
          step="0.01"
          value={values.quantity}
          onChange={(event) => updateField('quantity', event.target.value)}
          placeholder="25"
        />
      </FormField>

      <FormField label="Delivery method" name="deliveryMethod" error={errors.deliveryMethod}>
        <div className="segmented-control three" role="radiogroup" aria-label="Delivery method">
          {DELIVERY_METHODS.map((method) => (
            <button
              key={method.value}
              type="button"
              className={values.deliveryMethod === method.value ? 'active' : ''}
              onClick={() => updateField('deliveryMethod', method.value)}
            >
              {method.label}
            </button>
          ))}
        </div>
      </FormField>

      {!isPickup ? (
        <FormField label="Deliver to (municipality)" name="deliveryMunicipality" error={errors.deliveryMunicipality}>
          <select
            id="deliveryMunicipality"
            value={values.deliveryMunicipality}
            onChange={(event) => updateField('deliveryMunicipality', event.target.value)}
          >
            {CEBU_MUNICIPALITIES.map((municipality) => <option key={municipality}>{municipality}</option>)}
          </select>
        </FormField>
      ) : null}

      <FormField label="Payment method" name="paymentMethod" error={errors.paymentMethod}>
        <div className="payment-grid" role="radiogroup" aria-label="Payment method">
          {PAYMENT_METHODS.map((method) => (
            <button
              key={method.value}
              type="button"
              className={values.paymentMethod === method.value ? 'active' : ''}
              onClick={() => updateField('paymentMethod', method.value)}
            >
              {method.label}
            </button>
          ))}
        </div>
      </FormField>

      <FormField label="Message to farmer" name="message" helper="Optional pickup, delivery, or timing note.">
        <textarea
          id="message"
          rows="4"
          value={values.message}
          onChange={(event) => updateField('message', event.target.value)}
          placeholder="Can we pick this up tomorrow morning?"
        />
      </FormField>

      <DeliveryFeeSummary
        subtotal={subtotal}
        estimate={feeEstimate}
        isLoading={isEstimating}
        error={estimateError}
        isPickup={isPickup}
      />

      <Button type="submit" className="full-width" disabled={isSubmitting}>
        {isSubmitting ? 'Placing order…' : isGcash ? 'Continue to GCash payment' : 'Place order — pay on delivery'}
      </Button>
    </form>
  );
}
