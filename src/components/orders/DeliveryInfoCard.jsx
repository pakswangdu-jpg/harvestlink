import { useRef, useState } from 'react';
import { ExternalLink, PackageCheck, Pencil, Truck } from 'lucide-react';
import Button from '../common/Button';
import CourierDialog from './CourierDialog';
import LinkLalamoveDeliveryDialog from './LinkLalamoveDeliveryDialog';
import { updateDeliveryStatus } from '../../services/deliveryService';
import { isOfficialLalamoveTrackingUrl, lalamoveDeliveryLabel } from '../../../backend/shared/lalamove';
import './LalamoveDelivery.css';

export default function DeliveryInfoCard({ order, delivery, farmerProfile, buyerProfile, isFarmer, canBook, onBooked, loading = false, error = '', onRetry }) {
  const [dialogMode, setDialogMode] = useState(null);
  const [busy, setBusy] = useState(false);
  const [handoverError, setHandoverError] = useState('');
  const inFlight = useRef(false);
  const trackingAvailable = isOfficialLalamoveTrackingUrl(delivery?.trackingUrl);
  const canEdit = isFarmer && delivery && order.status === 'confirmed' && ['packed', 'out_for_delivery'].includes(order.deliveryStatus);
  const canHandOver = canEdit && order.deliveryStatus === 'packed' && trackingAvailable && Boolean(delivery.bookingReference?.trim());
  const handleSaved = (result) => { setDialogMode(null); onBooked?.(result); };
  const handleHandover = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setHandoverError('');
    try {
      const result = await updateDeliveryStatus(order.id, 'out_for_delivery');
      handleSaved(result);
    } catch (failure) { setHandoverError(failure.message || 'Could not confirm handover.'); }
    finally { inFlight.current = false; setBusy(false); }
  };
  return (
    <section id="courier-delivery" className="panel lalamove-delivery" aria-label="Lalamove delivery">
      <header className="lalamove-heading"><div><h2>Lalamove</h2><p>Third-party courier</p></div>
        {!loading && !error ? <span className="lalamove-state">{lalamoveDeliveryLabel(order, delivery)}</span> : null}
      </header>
      {loading ? <p role="status">Loading courier details...</p> : error ? <div role="alert"><p>{error}</p><Button variant="secondary" onClick={onRetry}>Try again</Button></div> : delivery ? <div className="lalamove-content"><div>
        <dl className="lalamove-details">
          <div><dt>Courier</dt><dd>Lalamove</dd></div>
          <div><dt>Booking number</dt><dd>{delivery.bookingReference || 'Not added'}</dd></div>
          {delivery.driverName ? <div><dt>Driver</dt><dd>{delivery.driverName}</dd></div> : null}
          {delivery.vehiclePlate ? <div><dt>Vehicle plate</dt><dd>{delivery.vehiclePlate}</dd></div> : null}
          <div><dt>Tracking</dt><dd>{trackingAvailable ? 'Official Lalamove tracking link added' : 'Valid tracking link not added'}</dd></div>
          {order.deliveryStatus === 'packed' ? <div><dt>Handover</dt><dd>Awaiting handover</dd></div> : null}
          {delivery.handedOverAt ? <div><dt>Handed to courier</dt><dd>{new Date(delivery.handedOverAt).toLocaleString()}</dd></div> : null}
        </dl>
        <p className="lalamove-tracking-note">Tracking provided by Lalamove</p>
        </div>
        <div className="lalamove-actions">
          {trackingAvailable ? <a className={`btn ${canHandOver ? 'btn-secondary' : 'btn-primary'} btn-md`} href={delivery.trackingUrl.trim()} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} /> Track with Lalamove</a> : null}
          {canHandOver ? <Button onClick={() => { setHandoverError(''); setDialogMode('handover'); }}><PackageCheck size={16} /> Mark as handed to courier</Button> : null}
          {canEdit ? <Button variant="secondary" onClick={() => setDialogMode('edit')}><Pencil size={15} /> Edit courier details</Button> : null}
        </div>
      </div> : <>
        <p className="lalamove-tracking-note">{isFarmer ? 'Book Lalamove manually, then save the booking number and official tracking link.' : 'The farmer has not added a Lalamove booking yet.'}</p>
        {isFarmer && canBook ? <div className="lalamove-actions"><Button onClick={() => setDialogMode('book')}><Truck size={16} /> Set up Lalamove delivery</Button></div> : null}
        {isFarmer && !canBook ? <p className="lalamove-booking-note">Booking is available when the order is packed and any required payment is verified.</p> : null}
      </>}
      {dialogMode === 'handover' ? <CourierDialog title="Hand order to Lalamove?" busy={busy} onClose={() => setDialogMode(null)}>
        <p>Confirm that the order has been physically handed to the assigned courier.</p>
        <dl className="lalamove-details"><div><dt>Courier</dt><dd>Lalamove</dd></div><div><dt>Booking</dt><dd>{delivery.bookingReference}</dd></div></dl>
        {handoverError ? <div className="form-alert error" role="alert">{handoverError}</div> : null}
        <div className="lalamove-actions"><Button variant="secondary" onClick={() => setDialogMode(null)} disabled={busy} autoFocus>Cancel</Button><Button onClick={handleHandover} disabled={busy}>{busy ? 'Confirming...' : 'Confirm handover'}</Button></div>
      </CourierDialog> : dialogMode ? <LinkLalamoveDeliveryDialog order={order} delivery={delivery} farmerProfile={farmerProfile} buyerProfile={buyerProfile} mode={dialogMode} onClose={() => setDialogMode(null)} onSaved={handleSaved} /> : null}
    </section>
  );
}
