import { Check, ClipboardList, MapPin, Package, Truck } from 'lucide-react';
import './OrderStatusSummary.css';

export default function OrderStatusSummary({ stageCounts }) {
  const statuses = [
    {
      status: 'pending', label: 'New Orders', count: stageCounts.pending,
      description: 'Awaiting confirmation', emptyDescription: 'No new orders',
      icon: ClipboardList, tone: 'attention',
    },
    {
      status: 'preparing', label: 'To Prepare', count: stageCounts.confirmed + stageCounts.preparing,
      description: 'Confirmed orders', emptyDescription: 'No orders to prepare',
      icon: Package, tone: 'neutral',
    },
    {
      status: 'ready_for_pickup', label: 'Ready for Pickup', count: stageCounts.ready_for_pickup,
      description: 'Waiting for buyer', emptyDescription: 'No pickups waiting',
      icon: MapPin, tone: 'pickup',
    },
    {
      status: 'out_for_delivery', label: 'Out for Delivery', count: stageCounts.out_for_delivery,
      description: 'Currently in transit', emptyDescription: 'No deliveries in transit',
      icon: Truck, tone: 'transit',
    },
    {
      status: 'completed', label: 'Completed', count: stageCounts.completed,
      description: 'Fulfilled orders', emptyDescription: 'No completed orders yet',
      icon: Check, tone: 'completed',
    },
  ];

  return (
    <div className="order-status-summary">
      <dl className="order-status-summary-list" aria-label="Order status overview">
        {statuses.map(({ status, label, count, description, emptyDescription, icon: Icon, tone }) => (
          <div key={status} className={`order-status-summary-item${count > 0 ? ` order-status-summary-${tone}` : ''}`}>
            <dt className="order-status-summary-label">
              <Icon size={18} strokeWidth={2} aria-hidden="true" />
              <span>{label}</span>
            </dt>
            <dd className="order-status-summary-count">{count}</dd>
            <dd className="order-status-summary-description">{count > 0 ? description : emptyDescription}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
