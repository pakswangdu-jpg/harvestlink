import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Truck, X } from 'lucide-react';
import Button from '../common/Button';
import FormField from '../common/FormField';
import { bookDelivery, updateDelivery } from '../../services/deliveryService';

const VEHICLE_TYPES = ['Motorcycle', 'Car', 'MPV / Van', 'Truck'];
const BOOKING_REFERENCE_MAX_LENGTH = 100;

function buildInitialForm(delivery) {
  return {
    driverName: delivery?.driverName || '',
    vehicleType: delivery?.vehicleType || '',
    bookingReference: delivery?.bookingReference || '',
    trackingUrl: delivery?.trackingUrl || '',
    estimatedArrival: delivery?.estimatedArrival || '',
  };
}

// The "professional dialog" the farmer sees after returning from booking on Lalamove's own
// website (or when editing what they already entered) — reuses the same centered-modal shell
// as LiveTrackingModal.jsx (.tracking-modal*) so it matches the app's one existing dialog
// pattern instead of inventing a second. HarvestLink never talks to the Lalamove API; this
// just records what the farmer read off Lalamove's own confirmation screen — see
// deliveries.controller.js.
export default function LinkLalamoveDeliveryDialog({ order, delivery, mode = 'book', onClose, onSaved }) {
  const [form, setForm] = useState(() => buildInitialForm(delivery));
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateField = (field) => (event) => {
    setForm((previous) => ({ ...previous, [field]: event.target.value }));
    setErrors((previous) => ({ ...previous, [field]: undefined }));
  };

  const validate = () => {
    const nextErrors = {};
    const trackingUrl = form.trackingUrl.trim();
    if (!trackingUrl) {
      nextErrors.trackingUrl = 'Enter the Lalamove tracking link.';
    } else if (!trackingUrl.startsWith('https://')) {
      nextErrors.trackingUrl = 'Tracking URL must begin with https://.';
    }
    if (form.bookingReference.trim().length > BOOKING_REFERENCE_MAX_LENGTH) {
      nextErrors.bookingReference = `Booking reference must be ${BOOKING_REFERENCE_MAX_LENGTH} characters or fewer.`;
    }
    return nextErrors;
  };

  const handleSave = async (event) => {
    event.preventDefault();
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setIsSubmitting(true);
    setSubmitError('');
    try {
      const payload = {
        driverName: form.driverName,
        vehicleType: form.vehicleType,
        bookingReference: form.bookingReference,
        trackingUrl: form.trackingUrl,
        estimatedArrival: form.estimatedArrival,
      };
      const result = mode === 'edit'
        ? { delivery: await updateDelivery(order.id, payload) }
        : await bookDelivery(order.id, payload);
      onSaved?.(result);
    } catch (error) {
      setSubmitError(error.message || 'Could not save delivery information.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        className="tracking-modal-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="tracking-modal delivery-link-modal"
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.98 }}
          transition={{ type: 'spring', damping: 26, stiffness: 300 }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="tracking-modal-header">
            <div>
              <p className="eyebrow">Courier</p>
              <h2>{mode === 'edit' ? 'Edit Delivery Information' : 'Complete Delivery Information'}</h2>
            </div>
            <button type="button" className="tracking-modal-close" onClick={onClose} aria-label="Close">
              <X size={18} />
            </button>
          </div>

          <p className="muted delivery-link-description">
            {mode === 'edit'
              ? 'Update the delivery details below — buyers see these changes immediately.'
              : 'After completing your booking on the Lalamove website, enter the delivery details below so buyers can track the shipment.'}
          </p>

          {submitError ? <div className="form-alert error">{submitError}</div> : null}

          <form className="form-stack" onSubmit={handleSave}>
            <div className="form-field">
              <span>Courier</span>
              <div className="delivery-link-courier-fixed"><Truck size={15} /> Lalamove</div>
            </div>

            <FormField
              label="Tracking URL"
              name="trackingUrl"
              error={errors.trackingUrl}
              helper="Paste the official Lalamove tracking link — this is what the buyer opens to follow the rider."
            >
              <input
                id="trackingUrl"
                value={form.trackingUrl}
                onChange={updateField('trackingUrl')}
                placeholder="https://track.lalamove.com/..."
              />
            </FormField>

            <FormField label="Booking reference" name="bookingReference" error={errors.bookingReference} helper="Optional">
              <input
                id="bookingReference"
                value={form.bookingReference}
                onChange={updateField('bookingReference')}
                maxLength={BOOKING_REFERENCE_MAX_LENGTH}
              />
            </FormField>

            <div className="form-grid">
              <FormField label="Driver name" name="driverName" helper="Optional">
                <input id="driverName" value={form.driverName} onChange={updateField('driverName')} placeholder="Juan Dela Cruz" />
              </FormField>
              <FormField label="Vehicle" name="vehicleType" helper="Optional">
                <select id="vehicleType" value={form.vehicleType} onChange={updateField('vehicleType')}>
                  <option value="">Not specified</option>
                  {VEHICLE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </FormField>
            </div>

            <FormField label="Estimated pickup time" name="estimatedArrival" helper="Optional">
              <input
                id="estimatedArrival"
                value={form.estimatedArrival}
                onChange={updateField('estimatedArrival')}
                placeholder="Around 3:30 PM"
              />
            </FormField>

            <div className="form-actions">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Saving…' : 'Link Delivery'}
              </Button>
              <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
                Cancel
              </Button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
