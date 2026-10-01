import { useEffect, useState } from 'react';
import { getOrdersByBuyer, getDeliverySequence, getNextDeliveryStatus } from '../services/orderService';

const POLL_INTERVAL_MS = 6000;








export function needsBuyerAction(order) {
  if (order.paymentStatus === 'pending' && order.paymentMethod === 'gcash') return true;
  if (order.status !== 'confirmed') return false;
  const nextStep = getNextDeliveryStatus(order);
  if (!nextStep) return false;
  const sequence = getDeliverySequence(order.deliveryMethod);
  return sequence[sequence.length - 1] === nextStep;
}




export function useBuyerNavBadges(buyerId) {
  const [ordersBadge, setOrdersBadge] = useState(0);

  useEffect(() => {
    if (!buyerId) return undefined;
    let cancelled = false;
    const refresh = () => {
      getOrdersByBuyer(buyerId)
        .then((orders) => {
          if (cancelled) return;
          setOrdersBadge(orders.filter(needsBuyerAction).length);
        })
        .catch(() => {

        });
    };
    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [buyerId]);

  return { ordersBadge };
}
