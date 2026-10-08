import { MapPin } from 'lucide-react';
import './TrackingRouteSummary.css';

function locationText(profile, municipality) {
  const address = profile?.address?.trim();
  const area = profile?.municipality || municipality;
  if (address && area && !address.toLowerCase().includes(area.toLowerCase())) return `${address}, ${area}`;
  return address || area || 'Saved location unavailable';
}

export default function TrackingRouteSummary({ order, farmerProfile, buyerProfile, receiverRole = 'buyer' }) {
  const receiverLabel = receiverRole === 'stakeholder' ? 'Stakeholder' : 'Buyer';
  const farm = {
    name: farmerProfile?.farmName || order.farmerFarmName || order.farmerName || 'Farm',
    address: locationText(farmerProfile, order.originMunicipality),
    helper: 'Farmer / source location',
  };
  const receiver = {
    name: order.buyerName || receiverLabel,
    address: locationText(buyerProfile, order.deliveryMethod === 'buyer_pickup' ? null : order.deliveryMunicipality),
    helper: `${receiverLabel} / receiving location`,
  };
  const points = [farm, receiver];

  return (
    <ol className="tracking-route-summary" aria-label="Order locations">
      {points.map((point, index) => (
        <li key={index === 0 ? 'origin' : 'destination'} className="tracking-route-stop">
          <span className={`tracking-route-marker${index === 0 ? ' is-start' : ' is-destination'}`} aria-hidden="true">
            {index === 0 ? <MapPin size={18} /> : <span className="tracking-route-destination-pin" />}
          </span>
          <div>
            <span className="tracking-route-label">{index === 0 ? 'Starting point' : 'Destination'}</span>
            <strong>{point.name}</strong>
            <p>{point.address}</p>
            <span className="tracking-route-helper">{point.helper}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}
