import { useState } from 'react';
import { ExternalLink, Truck } from 'lucide-react';
import Button from '../common/Button';
import FormField from '../common/FormField';
import { bookDelivery } from '../../services/deliveryService';

const LALAMOVE_URL = 'https://www.lalamove.com/philippines';

const VEHICLE_TYPES = ['Motorcycle', 'Car', 'MPV / Van', 'Truck'];

// Farmer-facing — shown once a courier order is packed and ready for pickup by the rider
// (see the "Book Lalamove Delivery" gating in FarmerOrders.jsx / OrderTracking.jsx).
// HarvestLink never books the delivery itself or talks to any Lalamove API: clicking the
// button just opens Lalamove's own site so the farmer can complete the booking there, then
// this form records what Lalamove gave them (driver, vehicle, tracking link) — saving it is
// what actually advances the order to "out for delivery" (see deliveryService.js's
// bookDelivery, which does both in one call).
export default function BookLalamoveFlow({ order, onBooked }) {
  // 'idle' | 'form' | 'submitting'
  const [stage, setStage] = useState('idle');
  const [form, setForm] = useState({
    courierCompany: 'Lalamove',
    driverName: '',
    driverPhone: '',
    vehicleType: VEHICLE_TYPES[0],
    bookingReference: '',
    trackingUrl: '',
    estimatedArrival: '',
  });
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');

  const updateField = (field) => (event) => {
    setForm((previous) => ({ ...previous, [field]: event.target.value }));
    setErrors((previous) => ({ ...previous, [field]: undefined }));
  };

  const handleStartBooking = () => {
    window.open(LALAMOVE_URL, '_blank', 'noreferrer');
    setStage('form');
  };

  const handleCancel = () => {
    setStage('idle');
    setSubmitError('');
  };

  const handleSave = async () => {
    const nextErrors = {};
    if (!form.driverName.trim()) nextErrors.driverName = 'Enter the driver\'s name.';
    if (!form.driverPhone.trim()) nextErrors.driverPhone = 'Enter the driver\'s contact number.';
    if (!form.trackingUrl.trim()) nextErrors.trackingUrl = 'Enter the Lalamove tracking link.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setStage('submitting');
    setSubmitError('');
    try {
      const result = await bookDelivery(order.id, {
        courierCompany: form.courierCompany,
        driverName: form.driverName,
        driverPhone: form.driverPhone,
        vehicleType: form.vehicleType,
        bookingReference: form.bookingReference,
        trackingUrl: form.trackingUrl,
        estimatedArrival: form.estimatedArrival,
      });
      onBooked?.(result);
      setStage('idle');
    } catch (error) {
      setSubmitError(error.message || 'Could not save delivery information.');
      setStage('form');
    }
  };

  if (stage === 'idle') {
    return (
      <Button onClick={handleStartBooking}>
        <Truck size={15} /> Book Lalamove Delivery
      </Button>
    );
  }

  return (
    <div className="panel lalamove-booking-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Courier</p>
          <h2>Book Lalamove Delivery</h2>
        </div>
      </div>

      <div className="form-alert info has-icon">
        <Truck size={16} />
        <span>
          Complete the booking on <a href={LALAMOVE_URL} target="_blank" rel="noreferrer">Lalamove <ExternalLink size={12} /></a>,
          then record the details Lalamove gave you below. Saving marks this order out for delivery.
        </span>
      </div>

      {submitError ? <div className="form-alert error">{submitError}</div> : null}

      <div className="form-section">
        <p className="form-section-heading">Courier &amp; vehicle</p>
        <div className="form-grid">
          <FormField label="Courier company" name="courierCompany">
            <input id="courierCompany" value={form.courierCompany} onChange={updateField('courierCompany')} />
          </FormField>
          <FormField label="Vehicle type" name="vehicleType">
            <select id="vehicleType" value={form.vehicleType} onChange={updateField('vehicleType')}>
              {VEHICLE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </FormField>
        </div>
      </div>

      <div className="form-section">
        <p className="form-section-heading">Driver</p>
        <div className="form-grid">
          <FormField label="Driver name" name="driverName" error={errors.driverName}>
            <input id="driverName" value={form.driverName} onChange={updateField('driverName')} placeholder="Juan Dela Cruz" />
          </FormField>
          <FormField label="Driver contact number" name="driverPhone" error={errors.driverPhone}>
            <input
              id="driverPhone"
              value={form.driverPhone}
              onChange={updateField('driverPhone')}
              placeholder="09171234567"
              inputMode="tel"
            />
          </FormField>
        </div>
      </div>

      <div className="form-section">
        <p className="form-section-heading">Tracking</p>
        {/* Full width and first in this group — it's the one field the buyer actually depends
            on (it's what backs the "Track Delivery" button on their order page), so it leads
            the section instead of trailing the optional fields as it used to. */}
        <FormField
          label="Tracking URL"
          name="trackingUrl"
          error={errors.trackingUrl}
          helper="Lalamove's own tracking page — this is what the buyer opens to follow the rider."
        >
          <input
            id="trackingUrl"
            value={form.trackingUrl}
            onChange={updateField('trackingUrl')}
            placeholder="https://track.lalamove.com/..."
          />
        </FormField>
        <div className="form-grid">
          <FormField label="Booking reference number" name="bookingReference" helper="Optional">
            <input id="bookingReference" value={form.bookingReference} onChange={updateField('bookingReference')} />
          </FormField>
          <FormField label="Estimated delivery time" name="estimatedArrival" helper="Optional">
            <input
              id="estimatedArrival"
              value={form.estimatedArrival}
              onChange={updateField('estimatedArrival')}
              placeholder="35 minutes"
            />
          </FormField>
        </div>
      </div>

      <div className="form-actions">
        <Button onClick={handleSave} disabled={stage === 'submitting'}>
          {stage === 'submitting' ? 'Saving…' : 'Save Delivery Information'}
        </Button>
        <Button variant="secondary" onClick={handleCancel} disabled={stage === 'submitting'}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
