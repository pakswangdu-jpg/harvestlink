import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, X } from 'lucide-react';
import {
  RETAIL_LALAMOVE_DESCRIPTION,
  WHOLESALE_DELIVERY_METHOD_LABELS,
  isRetailLalamoveOrder,
  validateWholesaleArrangementInput,
} from '../../../backend/shared/wholesaleDelivery.js';
import { calculateFeeForDistance } from '../../../backend/src/lib/deliveryFeeConfig.js';
import { arrangeWholesaleDelivery, confirmWholesaleDelivery } from '../../services/orderService';
import { useOptionalToast } from '../../contexts/ToastContext';
import { getMunicipalityCoords } from '../../utils/constants';
import { haversineKm } from '../../utils/geo';
import { formatCurrency, formatDate, formatTime } from '../../utils/formatters';
import Button from '../common/Button';

const SHORT_METHOD_LABELS = {
  farmer_arranged: 'Farmer-Arranged Delivery',
  farmer_delivery: 'Farmer Delivery',
  courier: 'Lalamove',
  buyer_pickup: 'Buyer Pickup',
};

function splitLocalDateTime(isoString) {
  if (!isoString) return { date: '', time: '' };
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return { date: '', time: '' };
  const pad = (value) => String(value).padStart(2, '0');
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
}

function combineDateTime(dateValue, timeValue) {
  const datePart = String(dateValue || '').trim();
  const timePart = String(timeValue || '').trim();
  if (!datePart && !timePart) return '';
  if (!datePart || !timePart) return 'invalid';
  return `${datePart}T${timePart}`;
}

export default function WholesaleDeliveryArrangement({ order, isFarmer, onUpdated, onNavigatePayment }) {
  const { showToast } = useOptionalToast();
  const isRetailLalamove = isRetailLalamoveOrder(order);
  const retailFarmerEstimate = useMemo(() => {
    const origin = getMunicipalityCoords(order.originMunicipality);
    const destination = getMunicipalityCoords(order.deliveryMunicipality || order.originMunicipality);
    const distanceKm = origin && destination ? haversineKm(origin, destination) : 0;
    return calculateFeeForDistance(distanceKm);
  }, [order.originMunicipality, order.deliveryMunicipality]);

  const initialMethod = isRetailLalamove
    ? 'courier'
    : ['farmer_delivery', 'courier', 'buyer_pickup'].includes(order.deliveryMethod)
      ? order.deliveryMethod
      : 'farmer_delivery';
  const initialDelivery = splitLocalDateTime(order.estimatedDeliveryAt);
  const [isEditing, setIsEditing] = useState(
    isFarmer && order.status === 'pending' && order.deliveryArrangementStatus === 'pending_farmer',
  );
  const [form, setForm] = useState({
    deliveryMethod: initialMethod,
    deliveryFee: initialMethod === 'buyer_pickup'
      ? '0'
      : order.deliveryArrangementStatus === 'pending_farmer'
        ? (initialMethod === 'farmer_delivery' ? String(retailFarmerEstimate.fee) : '')
        : String(order.deliveryFee ?? ''),
    estimatedPickupTime: order.estimatedPickupTime || '',
    estimatedDeliveryDate: initialDelivery.date,
    estimatedDeliveryTime: initialDelivery.time,
    bookingReference: order.courierBookingReference || '',
    vehiclePlateNumber: order.vehiclePlateNumber || '',
    deliveryInstructions: order.deliveryInstructions || '',
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmationModal, setConfirmationModal] = useState(null);

  useEffect(() => {
    if (!confirmationModal) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setConfirmationModal(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [confirmationModal]);

  const subtotal = Math.round((Number(order.unitPrice) * Number(order.quantity) + Number.EPSILON) * 100) / 100;
  const parsedFee = form.deliveryFee === '' ? NaN : Number(form.deliveryFee);
  const previewTotal = Number.isFinite(parsedFee) && parsedFee >= 0 ? subtotal + parsedFee : null;
  const isLalamoveSelected = form.deliveryMethod === 'courier';
  const isBuyerPickupSelected = form.deliveryMethod === 'buyer_pickup';
  const arrangementStatus = order.deliveryArrangementStatus;

  const updateField = (field, value) => {
    setForm((previous) => {
      if (field === 'deliveryMethod') {
        const nextFee = value === 'buyer_pickup'
          ? '0'
          : value === 'farmer_delivery'
            ? String(retailFarmerEstimate.fee)
            : previous.deliveryMethod !== 'courier'
              ? ''
              : previous.deliveryFee;
        return { ...previous, deliveryMethod: value, deliveryFee: nextFee };
      }
      return { ...previous, [field]: value };
    });
    setFieldErrors((previous) => ({
      ...previous,
      [field]: undefined,
      ...(field === 'deliveryMethod' ? { deliveryFee: undefined, estimatedDeliveryAt: undefined, estimatedPickupTime: undefined, bookingReference: undefined, vehiclePlateNumber: undefined } : {}),
    }));
    setError('');
  };

  const handleSaveArrangement = async (event) => {
    event.preventDefault();
    const combinedDeliveryAt = isLalamoveSelected
      ? combineDateTime(form.estimatedDeliveryDate, form.estimatedDeliveryTime)
      : '';
    const effectiveFee = isBuyerPickupSelected ? '0' : form.deliveryFee;
    const errors = validateWholesaleArrangementInput({
      ...form,
      deliveryFee: effectiveFee,
      estimatedDeliveryAt: combinedDeliveryAt,
      vehiclePlateNumber: isLalamoveSelected ? form.vehiclePlateNumber : '',
    });
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const updated = await arrangeWholesaleDelivery(order.id, {
        deliveryMethod: form.deliveryMethod,
        deliveryFee: Number(effectiveFee),
        estimatedPickupTime: isLalamoveSelected ? form.estimatedPickupTime.trim() : null,
        estimatedDeliveryAt: combinedDeliveryAt ? new Date(combinedDeliveryAt).toISOString() : null,
        bookingReference: isLalamoveSelected ? form.bookingReference.trim() : null,
        vehiclePlateNumber: isLalamoveSelected ? (form.vehiclePlateNumber.trim().toUpperCase() || null) : null,
        deliveryInstructions: form.deliveryInstructions.trim() || null,
      });
      onUpdated(updated);
      setIsEditing(false);
      const confirmationText = `Buyer has been notified to prepare the exact amount of ${formatCurrency(updated.totalAmount)} and confirm the order.`;
      setNotice(confirmationText);
      showToast({
        type: 'success',
        title: 'Delivery Arrangement Submitted',
        message: confirmationText,
        duration: 5500,
      });
    } catch (submitError) {
      setError(submitError.message || 'Unable to save delivery arrangement.');
    } finally {
      setBusy(false);
    }
  };

  const handleBuyerConfirm = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const updated = await confirmWholesaleDelivery(order.id, order.deliveryArrangedAt);
      onUpdated(updated);
      const confirmedTotal = updated.buyerConfirmedTotal ?? updated.totalAmount;
      const methodLabel = SHORT_METHOD_LABELS[updated.deliveryMethod]
        || WHOLESALE_DELIVERY_METHOD_LABELS[updated.deliveryMethod]
        || updated.deliveryMethod;
      const isGcash = updated.paymentMethod === 'gcash';
      const paymentInstruction = isGcash
        ? 'Please prepare this exact amount for GCash payment verification before dispatch.'
        : 'Please prepare this exact amount for Cash on Delivery upon arrival.';
      setNotice(`Final amount confirmed: ${formatCurrency(confirmedTotal)}. ${paymentInstruction}`);
      setConfirmationModal({
        confirmedTotal,
        subtotal,
        deliveryFee: updated.deliveryFee,
        methodLabel,
        paymentLabel: isGcash ? 'GCash' : 'Cash on Delivery',
        paymentInstruction,
        showGcashAction: Boolean(isGcash && updated.paymentStatus === 'pending' && !updated.paymentVerificationStatus && onNavigatePayment),
      });
    } catch (confirmError) {
      setError(confirmError.message || 'Unable to confirm delivery arrangement.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="wholesale-delivery-arrangement" className="panel form-stack wholesale-arrangement-panel" aria-label={isRetailLalamove ? 'Lalamove Delivery Arrangement' : 'Wholesale Delivery Arrangement'}>
      <div className="section-heading">
        <div>
          <h2>{isRetailLalamove ? 'Lalamove delivery arrangement' : 'Wholesale delivery arrangement'}</h2>
          <p className="ot-section-subtitle">
            {arrangementStatus === 'pending_farmer'
              ? (isRetailLalamove
                ? 'Waiting for the farmer to obtain the actual Lalamove quotation and enter delivery details.'
                : 'Waiting for the farmer to select a delivery method and enter actual delivery details.')
              : arrangementStatus === 'pending_buyer_confirmation'
                ? 'Review the delivery details and confirm the final amount before payment or dispatch.'
                : 'Delivery arrangement and final total confirmed.'}
          </p>
        </div>
        {isFarmer && order.status === 'pending' && !isEditing ? (
          <Button variant="secondary" size="sm" onClick={() => setIsEditing(true)}>
            {arrangementStatus === 'pending_farmer' ? 'Arrange Delivery' : 'Update Delivery Arrangement'}
          </Button>
        ) : null}
      </div>

      {notice ? <div className="form-alert success" role="status">{notice}</div> : null}
      {error ? <div className="form-alert error" role="alert">{error}</div> : null}

      {isFarmer && order.status === 'pending' && isEditing ? (
        <form className="form-stack" onSubmit={handleSaveArrangement}>
          {order.deliveryAddress ? (
            <div className="ot-detail-row">
              <span>Buyer delivery address</span>
              <strong>{order.deliveryAddress}</strong>
            </div>
          ) : null}

          <div className="form-grid">
            <label className="form-field">
              <span>Delivery method</span>
              <select
                value={isRetailLalamove ? 'courier' : form.deliveryMethod}
                disabled={busy || isRetailLalamove}
                onChange={(event) => updateField('deliveryMethod', event.target.value)}
              >
                {!isRetailLalamove ? <option value="farmer_delivery">Farmer Delivery</option> : null}
                <option value="courier">Lalamove</option>
                {!isRetailLalamove ? <option value="buyer_pickup">Buyer Pickup (Subject to buyer agreement)</option> : null}
              </select>
              {fieldErrors.deliveryMethod ? <span className="field-error">{fieldErrors.deliveryMethod}</span> : null}
            </label>

            <label className="form-field">
              <span>Delivery Fee (PHP)</span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={isBuyerPickupSelected ? '0' : form.deliveryFee}
                disabled={busy || isBuyerPickupSelected}
                placeholder={isBuyerPickupSelected ? '0.00 (Free for Buyer Pickup)' : 'e.g. 350.00'}
                onChange={(event) => updateField('deliveryFee', event.target.value)}
              />
              {isBuyerPickupSelected ? (
                <span className="field-hint">Buyer Pickup is free (₱0.00) and uses the standard pickup flow with route map.</span>
              ) : !isLalamoveSelected ? (
                <span className="field-hint">
                  Auto-filled using standard distance fee ({retailFarmerEstimate.tierLabel}). Uses live GPS map tracking once confirmed.
                </span>
              ) : null}
              {fieldErrors.deliveryFee ? <span className="field-error">{fieldErrors.deliveryFee}</span> : null}
            </label>
          </div>

          {isLalamoveSelected ? (
            <>
              <div className="form-grid">
                <label className="form-field">
                  <span>Estimated Delivery Date</span>
                  <input
                    type="date"
                    value={form.estimatedDeliveryDate}
                    disabled={busy}
                    onChange={(event) => {
                      updateField('estimatedDeliveryDate', event.target.value);
                      setFieldErrors((previous) => ({ ...previous, estimatedDeliveryAt: undefined }));
                    }}
                  />
                  {fieldErrors.estimatedDeliveryAt ? <span className="field-error">{fieldErrors.estimatedDeliveryAt}</span> : null}
                </label>

                <label className="form-field">
                  <span>Estimated Delivery Time</span>
                  <input
                    type="time"
                    value={form.estimatedDeliveryTime}
                    disabled={busy}
                    onChange={(event) => {
                      updateField('estimatedDeliveryTime', event.target.value);
                      setFieldErrors((previous) => ({ ...previous, estimatedDeliveryAt: undefined }));
                    }}
                  />
                </label>
              </div>

              <div className="form-grid">
                <label className="form-field">
                  <span>Estimated Pickup Time</span>
                  <input
                    type="text"
                    value={form.estimatedPickupTime}
                    disabled={busy}
                    placeholder="e.g. Today, 2:00 PM – 3:00 PM"
                    onChange={(event) => updateField('estimatedPickupTime', event.target.value)}
                  />
                  {fieldErrors.estimatedPickupTime ? <span className="field-error">{fieldErrors.estimatedPickupTime}</span> : null}
                </label>

                <label className="form-field">
                  <span>Lalamove Booking Reference (optional until booked)</span>
                  <input
                    type="text"
                    value={form.bookingReference}
                    disabled={busy}
                    placeholder="Optional until booked in Lalamove"
                    onChange={(event) => updateField('bookingReference', event.target.value)}
                  />
                  {fieldErrors.bookingReference ? <span className="field-error">{fieldErrors.bookingReference}</span> : null}
                </label>
              </div>

              <label className="form-field">
                <span>Delivery Truck / Vehicle Plate Number (optional)</span>
                <input
                  type="text"
                  maxLength={15}
                  value={form.vehiclePlateNumber}
                  disabled={busy}
                  placeholder="e.g. ABC 1234"
                  onChange={(event) => updateField('vehiclePlateNumber', event.target.value.toUpperCase())}
                />
                {fieldErrors.vehiclePlateNumber ? <span className="field-error">{fieldErrors.vehiclePlateNumber}</span> : null}
              </label>
            </>
          ) : null}

          <label className="form-field">
            <span>Additional Delivery Instructions (optional)</span>
            <textarea
              rows="3"
              value={form.deliveryInstructions}
              disabled={busy}
              placeholder="Add any drop-off, vehicle, or collection notes for the buyer."
              onChange={(event) => updateField('deliveryInstructions', event.target.value)}
            />
          </label>

          <div className="ot-detail-group wholesale-totals-summary">
            <div className="ot-detail-row"><span>Product subtotal</span><strong>{formatCurrency(subtotal)}</strong></div>
            <div className="ot-detail-row"><span>Delivery fee</span><strong>{previewTotal != null ? formatCurrency(parsedFee) : '--'}</strong></div>
            <div className="ot-detail-row wholesale-total-row"><span>Final order total</span><strong>{previewTotal != null ? formatCurrency(previewTotal) : '--'}</strong></div>
          </div>

          <div className="form-actions">
            {arrangementStatus !== 'pending_farmer' ? (
              <Button type="button" variant="secondary" disabled={busy} onClick={() => setIsEditing(false)}>Cancel</Button>
            ) : null}
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Submit Delivery Arrangement'}
            </Button>
          </div>
        </form>
      ) : arrangementStatus === 'pending_farmer' ? (
        <p className="muted">
          {isRetailLalamove
            ? RETAIL_LALAMOVE_DESCRIPTION
            : 'The farmer is reviewing your wholesale order quantity and location to determine the most suitable delivery method and fee.'}
        </p>
      ) : (
        <div className="form-stack">
          {!isFarmer ? (
            <div className="wholesale-exact-amount-callout" role="status">
              <p className="wholesale-exact-amount-title">
                Please prepare the exact amount: {formatCurrency(order.buyerConfirmedTotal ?? order.totalAmount)}
              </p>
              <p className="wholesale-exact-amount-text">
                Product subtotal ({formatCurrency(subtotal)}) + {WHOLESALE_DELIVERY_METHOD_LABELS[order.deliveryMethod] || order.deliveryMethod} delivery fee ({formatCurrency(order.deliveryFee)}).
                {' '}
                {order.paymentMethod === 'gcash'
                  ? 'Please prepare this exact amount for GCash payment verification before dispatch.'
                  : 'Please prepare this exact amount for Cash on Delivery upon arrival.'}
              </p>
            </div>
          ) : null}

          <div className="ot-detail-group">
            <div className="ot-detail-row">
              <span>Selected Delivery Method</span>
              <strong>{WHOLESALE_DELIVERY_METHOD_LABELS[order.deliveryMethod] || order.deliveryMethod}</strong>
            </div>
            {order.deliveryAddress ? (
              <div className="ot-detail-row">
                <span>Delivery Address</span>
                <strong>{order.deliveryAddress}</strong>
              </div>
            ) : null}
            <div className="ot-detail-row">
              <span>Product Subtotal</span>
              <strong>{formatCurrency(subtotal)}</strong>
            </div>
            <div className="ot-detail-row">
              <span>Delivery Fee</span>
              <strong>{formatCurrency(order.deliveryFee)}</strong>
            </div>
            {order.estimatedPickupTime ? (
              <div className="ot-detail-row">
                <span>Estimated Pickup Time</span>
                <strong>{order.estimatedPickupTime}</strong>
              </div>
            ) : null}
            {order.estimatedDeliveryAt ? (
              <div className="ot-detail-row">
                <span>Estimated Delivery Date and Time</span>
                <strong>{formatDate(order.estimatedDeliveryAt)} · {formatTime(order.estimatedDeliveryAt)}</strong>
              </div>
            ) : null}
            {order.courierBookingReference ? (
              <div className="ot-detail-row">
                <span>Lalamove Booking Reference</span>
                <strong>{order.courierBookingReference}</strong>
              </div>
            ) : null}
            {order.vehiclePlateNumber ? (
              <div className="ot-detail-row">
                <span>Delivery Truck / Vehicle Plate Number</span>
                <strong>{order.vehiclePlateNumber}</strong>
              </div>
            ) : null}
            {order.deliveryInstructions ? (
              <div className="ot-detail-row">
                <span>Additional Delivery Instructions</span>
                <strong>{order.deliveryInstructions}</strong>
              </div>
            ) : null}
            <div className="ot-detail-row wholesale-total-row">
              <span>Final Order Total</span>
              <strong>{formatCurrency(order.buyerConfirmedTotal ?? order.totalAmount)}</strong>
            </div>
          </div>

          {!isFarmer && order.status === 'pending' && arrangementStatus === 'pending_buyer_confirmation' ? (
            <div className="form-stack">
              <p className="muted">
                {order.paymentMethod === 'gcash'
                  ? 'After confirming the final amount, you will be able to submit your GCash payment for verification before dispatch.'
                  : 'For Cash on Delivery, the confirmed final total will be collected upon delivery.'}
              </p>
              <div className="form-actions">
                <Button disabled={busy} onClick={handleBuyerConfirm}>
                  {busy ? 'Confirming…' : 'Confirm Final Amount'}
                </Button>
              </div>
            </div>
          ) : null}

          {!isFarmer && arrangementStatus === 'confirmed' && order.paymentMethod === 'gcash' && order.paymentStatus === 'pending' && !order.paymentVerificationStatus && onNavigatePayment ? (
            <div className="form-actions">
              <Button onClick={onNavigatePayment}>Proceed to GCash Payment</Button>
            </div>
          ) : null}
        </div>
      )}

      {confirmationModal ? (
        <div
          className="wholesale-confirm-modal-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) setConfirmationModal(null);
          }}
        >
          <div
            className="wholesale-confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wholesale-confirm-modal-title"
          >
            <button
              type="button"
              className="wholesale-confirm-modal-close"
              aria-label="Close confirmation dialog"
              onClick={() => setConfirmationModal(null)}
            >
              <X size={16} aria-hidden="true" />
            </button>

            <div className="wholesale-confirm-modal-header">
              <span className="wholesale-confirm-modal-icon" aria-hidden="true">
                <CheckCircle2 size={20} strokeWidth={2.2} />
              </span>
              <div>
                <h3 id="wholesale-confirm-modal-title">Final Amount Confirmed</h3>
                <p>{confirmationModal.paymentInstruction}</p>
              </div>
            </div>

            <div className="wholesale-confirm-amount-box">
              <span className="wholesale-confirm-amount-label">Exact Amount to Prepare</span>
              <strong className="wholesale-confirm-amount-value">
                {formatCurrency(confirmationModal.confirmedTotal)}
              </strong>
            </div>

            <div className="wholesale-confirm-breakdown">
              <div className="wholesale-confirm-breakdown-row">
                <span>Product subtotal</span>
                <strong>{formatCurrency(confirmationModal.subtotal)}</strong>
              </div>
              <div className="wholesale-confirm-breakdown-row">
                <span>Delivery fee ({confirmationModal.methodLabel})</span>
                <strong>{formatCurrency(confirmationModal.deliveryFee)}</strong>
              </div>
              <div className="wholesale-confirm-breakdown-row">
                <span>Payment method</span>
                <strong>{confirmationModal.paymentLabel}</strong>
              </div>
            </div>

            <div className="wholesale-confirm-modal-actions">
              {confirmationModal.showGcashAction ? (
                <>
                  <Button variant="secondary" onClick={() => setConfirmationModal(null)}>Close</Button>
                  <Button onClick={() => {
                    setConfirmationModal(null);
                    onNavigatePayment();
                  }}>
                    Proceed to GCash Payment
                  </Button>
                </>
              ) : (
                <Button onClick={() => setConfirmationModal(null)}>Got it</Button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
