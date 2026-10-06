import { Check, ClipboardList, MapPin, Package, Truck } from 'lucide-react';
import './OrderStatusSummary.css';

export default function OrderStatusSummary({ stageCounts, activeStage, onSelectStage }) {
  const statuses = [
    {
      status: 'pending', label: 'New orders', count: stageCounts.pending,
      description: 'Awaiting confirmation', emptyDescription: 'No new orders',
      icon: ClipboardList, tone: 'attention',
    },
    {
      status: 'to_prepare', label: 'To prepare', count: stageCounts.confirmed + stageCounts.preparing,
      description: 'Confirmed orders', emptyDescription: 'No orders to prepare',
      icon: Package, tone: 'neutral',
    },
    {
      status: 'ready_for_pickup', label: 'Ready for pickup', count: stageCounts.ready_for_pickup,
      description: 'Waiting for buyer', emptyDescription: 'No pickups waiting',
      icon: MapPin, tone: 'pickup',
    },
    {
      status: 'out_for_delivery', label: 'Out for delivery', count: stageCounts.out_for_delivery,
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
    <section className="order-status-summary" aria-label="Order overview">
      <h2>Order overview</h2>
      <div className="order-status-summary-list" role="group" aria-label="Filter orders by status">
        {statuses.map(({ status, label, count, description, emptyDescription, icon: Icon, tone }) => (
          <button
            key={status}
            type="button"
            className={`order-status-summary-item${count > 0 ? ` order-status-summary-${tone}` : ''}`}
            aria-pressed={activeStage === status}
            onClick={() => onSelectStage(status)}
          >
            <span className="order-status-summary-count">{count}</span>
            <span className="order-status-summary-label">
              <Icon size={16} strokeWidth={2} aria-hidden="true" />
              <span>{label}</span>
            </span>
            <span className="order-status-summary-description">{count > 0 ? description : emptyDescription}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
