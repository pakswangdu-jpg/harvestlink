import { useEffect, useState } from 'react';
import { getOrdersByBuyer, getDeliverySequence, getNextDeliveryStatus } from '../services/orderService';

const POLL_INTERVAL_MS = 6000;

// Whether THIS buyer specifically needs to do something about this order — either pay
// (GCash left pending, e.g. they backed out of the payment page) or confirm receipt (the
// order has reached the last delivery step and is waiting on their own "Got it" click — see
// the isFinalNextStep logic in OrderTracking.jsx, mirrored here).
// Exported since a stakeholder's own marketplace purchases (src/hooks/
// useStakeholderNavBadges.js) work exactly the same way — a stakeholder is just a buyer by
// order-row ownership (buyer_id), same as a buyer-role account.
export function needsBuyerAction(order) {
  if (order.paymentStatus === 'pending' && order.paymentMethod === 'gcash') return true;
  if (order.status !== 'confirmed') return false;
  const nextStep = getNextDeliveryStatus(order);
  if (!nextStep) return false;
  const sequence = getDeliverySequence(order.deliveryMethod);
  return sequence[sequence.length - 1] === nextStep;
}

// Mirrors useFarmerNavBadges.js — mounted at the app-shell level so the "My orders" badge
// stays accurate no matter which buyer page is open, not just while that page happens to be
// mounted.
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
          // A transient failure here just skips this tick — the next poll retries.
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
