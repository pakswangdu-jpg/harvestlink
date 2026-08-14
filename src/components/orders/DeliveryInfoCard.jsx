import { useState } from 'react';
import {
  Bike, Clock, ExternalLink, Hash, Pencil, User,
} from 'lucide-react';
import StatusBadge from '../common/StatusBadge';
import Button from '../common/Button';
import DeliveryTruckIcon from '../icons/DeliveryTruckIcon';
import LinkLalamoveDeliveryDialog from './LinkLalamoveDeliveryDialog';

const LALAMOVE_URL = 'https://www.lalamove.com/philippines';

// The courier order's persistent "Delivery Information" card — always shown once the order is
// trackable and courier-delivered, in one of two states: not yet booked (Courier/Status/
// Tracking all show placeholder values, with a "Book with Lalamove" button for the farmer once
// the order is ready) or booked (the details the farmer entered after booking on Lalamove's
// own site — see LinkLalamoveDeliveryDialog.jsx). HarvestLink never books the delivery itself
// or talks to any Lalamove API; "Track Delivery" just opens Lalamove's own official tracking
// page in a new tab.
export default function DeliveryInfoCard({ order, delivery, isFarmer, canBook, onBooked }) {
  const [dialogMode, setDialogMode] = useState(null); // null | 'book' | 'edit'

  const handleStartBooking = () => {
    window.open(LALAMOVE_URL, '_blank', 'noreferrer');
    setDialogMode('book');
  };

  const handleSaved = (result) => {
    setDialogMode(null);
    onBooked?.(result);
  };

  return (
    <div className="panel delivery-info-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Courier</p>
          <h2>Delivery Information</h2>
        </div>
        {delivery ? (
          <StatusBadge value={delivery.deliveryStatus} type="courierDeliveryStatus" />
        ) : (
          <span className="badge badge-pending">Pending</span>
        )}
      </div>

      {delivery ? (
        <>
          <dl className="delivery-info-grid">
            <div className="delivery-info-item">
              <span className="delivery-info-icon"><DeliveryTruckIcon size={16} /></span>
              <div><dt>Courier</dt><dd>{delivery.courierCompany}</dd></div>
            </div>
            <div className="delivery-info-item">
              <span className="delivery-info-icon"><ExternalLink size={16} /></span>
              <div><dt>Tracking</dt><dd>Available</dd></div>
            </div>
            {delivery.driverName ? (
              <div className="delivery-info-item">
                <span className="delivery-info-icon"><User size={16} /></span>
                <div><dt>Driver</dt><dd>{delivery.driverName}</dd></div>
              </div>
            ) : null}
            {delivery.vehicleType ? (
              <div className="delivery-info-item">
                <span className="delivery-info-icon"><Bike size={16} /></span>
                <div><dt>Vehicle</dt><dd>{delivery.vehicleType}</dd></div>
              </div>
            ) : null}
            {delivery.estimatedArrival ? (
              <div className="delivery-info-item">
                <span className="delivery-info-icon"><Clock size={16} /></span>
                <div><dt>Estimated Pickup</dt><dd>{delivery.estimatedArrival}</dd></div>
              </div>
            ) : null}
            {delivery.bookingReference ? (
              <div className="delivery-info-item">
                <span className="delivery-info-icon"><Hash size={16} /></span>
                <div><dt>Booking Reference</dt><dd>{delivery.bookingReference}</dd></div>
              </div>
            ) : null}
          </dl>

          <div className="delivery-info-actions">
            <a className="btn btn-primary btn-md" href={delivery.trackingUrl} target="_blank" rel="noreferrer">
              <ExternalLink size={15} /> Track Delivery
            </a>
            {isFarmer ? (
              <Button variant="secondary" onClick={() => setDialogMode('edit')}>
                <Pencil size={15} /> Edit Delivery Information
              </Button>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <dl className="delivery-info-grid">
            <div className="delivery-info-item">
              <span className="delivery-info-icon"><DeliveryTruckIcon size={16} /></span>
              <div><dt>Courier</dt><dd className="muted">Not Assigned</dd></div>
            </div>
            <div className="delivery-info-item">
              <span className="delivery-info-icon"><ExternalLink size={16} /></span>
              <div><dt>Tracking</dt><dd className="muted">Not Available</dd></div>
            </div>
          </dl>

          {isFarmer ? (
            canBook ? (
              <Button onClick={handleStartBooking}>
                <DeliveryTruckIcon size={15} /> Book with Lalamove
              </Button>
            ) : (
              <p className="muted">Book a courier once this order is packed and ready for pickup.</p>
            )
          ) : (
            <p className="muted">The farmer hasn&apos;t booked a courier for this order yet.</p>
          )}
        </>
      )}

      {dialogMode ? (
        <LinkLalamoveDeliveryDialog
          order={order}
          delivery={dialogMode === 'edit' ? delivery : null}
          mode={dialogMode}
          onClose={() => setDialogMode(null)}
          onSaved={handleSaved}
        />
      ) : null}
    </div>
  );
}
