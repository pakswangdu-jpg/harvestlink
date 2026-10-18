import { Check } from 'lucide-react';
import { getDeliverySequence } from '../../services/orderService';

export default function CourierDeliveryTimeline({ order, delivery }) {
  if (['rejected', 'cancelled'].includes(order.status)) return <p className="muted tracker-inactive">This order was {order.status}.</p>;
  const active = ['confirmed', 'completed'].includes(order.status);
  const sequence = getDeliverySequence(order.deliveryMethod);
  const index = sequence.indexOf(order.deliveryStatus);
  const delivered = order.deliveryStatus === 'delivered' || order.status === 'completed';
  const handedOver = delivered || order.deliveryStatus === 'out_for_delivery';
  const steps = [
    ['placed', 'Order placed', true],
    ['confirmed', 'Farmer confirmed', active],
    ['preparing', 'Preparing', active && index >= sequence.indexOf('preparing')],
    ['packed', 'Packed', active && index >= sequence.indexOf('packed')],
    ['booked', 'Courier booked', Boolean(delivery)],
    ['handover', 'Handed to courier', handedOver],
    ['delivered', 'Delivered', delivered],
  ];
  const activeIndex = steps.findIndex((step) => !step[2]);
  return <ol className="tracker" aria-label="Courier delivery progress">
    {steps.map(([key, label, done], stepIndex) => {
      const state = done ? 'done' : stepIndex === activeIndex ? 'active' : 'upcoming';
      return <li key={key} className={`tracker-step ${state}`}>
        <span className="tracker-icon">{done ? <Check size={14} /> : <span className="tracker-icon-dot" />}</span>
        <span className="tracker-step-body"><span className="tracker-label">{label}</span></span>
      </li>;
    })}
  </ol>;
}
