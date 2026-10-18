import { useRef, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import Button from '../common/Button';
import FormField from '../common/FormField';
import CourierDialog from './CourierDialog';
import { bookDelivery, updateDelivery } from '../../services/deliveryService';
import { isOfficialLalamoveTrackingUrl, LALAMOVE_BOOKING_URL } from '../../../backend/shared/lalamove';

export default function LinkLalamoveDeliveryDialog({ order, delivery, farmerProfile, buyerProfile, mode = 'book', onClose, onSaved }) {
  const [form, setForm] = useState({
    driverName: delivery?.driverName || '', vehiclePlate: delivery?.vehiclePlate || '',
    bookingReference: delivery?.bookingReference || '', trackingUrl: delivery?.trackingUrl || '',
  });
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const updateField = (field) => (event) => {
    setForm((previous) => ({ ...previous, [field]: event.target.value }));
    setErrors((previous) => ({ ...previous, [field]: undefined }));
  };
  const handleSave = async (event) => {
    event.preventDefault();
    if (inFlight.current) return;
    const nextErrors = {};
    if (!form.bookingReference.trim()) nextErrors.bookingReference = 'Enter the Lalamove booking number.';
    if (!isOfficialLalamoveTrackingUrl(form.trackingUrl)) nextErrors.trackingUrl = 'Enter the official HTTPS Lalamove tracking/share link.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    inFlight.current = true;
    setBusy(true);
    setSubmitError('');
    try {
      const result = mode === 'edit'
        ? { delivery: await updateDelivery(order.id, form) }
        : await bookDelivery(order.id, form);
      onSaved?.(result);
    } catch (error) {
      setSubmitError(error.message || 'Could not save courier details.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  return (
    <CourierDialog title={mode === 'edit' ? 'Edit Lalamove details' : 'Lalamove delivery'} busy={busy} onClose={onClose}>
      <div className="lalamove-addresses">
        <div><span>Pickup</span><strong>{farmerProfile?.farmName || order.farmerFarmName || order.farmerName}</strong>
          <p>{farmerProfile?.address || order.originMunicipality || 'Pickup address unavailable'}</p>
          {!farmerProfile?.address ? <p className="lalamove-booking-note">Confirm the full pickup address in Lalamove before booking.</p> : null}</div>
        <div><span>Deliver to</span><strong>{order.buyerName}</strong>
          <p>{buyerProfile?.address || order.deliveryMunicipality || 'Delivery address unavailable'}</p>
          {!buyerProfile?.address ? <p className="lalamove-booking-note">Confirm the full delivery address in Lalamove before booking.</p> : null}</div>
      </div>
      {mode === 'book' ? <>
        <ol className="lalamove-instructions">
          <li>Book this delivery using Lalamove.</li>
          <li>Copy the official tracking/share link.</li>
          <li>Return to HarvestLink and save the booking details.</li>
        </ol>
        <a className="btn btn-secondary btn-md" href={LALAMOVE_BOOKING_URL} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} /> Open Lalamove</a>
      </> : null}
      <form className="form-stack lalamove-booking-form" onSubmit={handleSave}>
        {submitError ? <div className="form-alert error" role="alert">{submitError}</div> : null}
        <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }} className="form-stack">
          <FormField label="Booking number *" name="bookingReference" error={errors.bookingReference}>
            <input id="bookingReference" value={form.bookingReference} onChange={updateField('bookingReference')} maxLength={100} required />
          </FormField>
          <FormField label="Official tracking link *" name="trackingUrl" error={errors.trackingUrl}>
            <input id="trackingUrl" type="url" value={form.trackingUrl} onChange={updateField('trackingUrl')}
              placeholder="https://share.lalamove.com/..." maxLength={2048} required />
          </FormField>
          <div className="form-grid">
            <FormField label="Driver name" name="driverName" helper="Optional">
              <input id="driverName" value={form.driverName} onChange={updateField('driverName')} maxLength={120} />
            </FormField>
            <FormField label="Vehicle plate" name="vehiclePlate" helper="Optional">
              <input id="vehiclePlate" value={form.vehiclePlate} onChange={updateField('vehiclePlate')} maxLength={15} pattern="[A-Za-z0-9 \-]+" />
            </FormField>
          </div>
        </fieldset>
        <p className="lalamove-booking-note">Saving a booking does not start delivery. Confirm handover only after giving the order to the courier.</p>
        <div className="lalamove-actions">
          <Button type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save courier details'}</Button>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
        </div>
      </form>
    </CourierDialog>
  );
}
