import { useEffect, useState } from 'react';
import { getAvailableDonations, getDonationsForStakeholder } from '../services/donationService';
import { getOrdersByBuyer } from '../services/orderService';
import { needsBuyerAction } from './useBuyerNavBadges';

const POLL_INTERVAL_MS = 6000;

// Mirrors useFarmerNavBadges.js — mounted at the app-shell level so all three badges stay
// accurate no matter which stakeholder page is open.
export function useStakeholderNavBadges(stakeholderId) {
  const [donationsBadge, setDonationsBadge] = useState(0);
  const [requestsBadge, setRequestsBadge] = useState(0);
  const [ordersBadge, setOrdersBadge] = useState(0);

  useEffect(() => {
    if (!stakeholderId) return undefined;
    let cancelled = false;
    const refresh = () => {
      // Donations are still localStorage-backed (see donationService.js), not a network
      // call, so these are cheap synchronous reads to redo on every tick.
      // "Browse donations" — new surplus a farmer has put up since this stakeholder last
      // looked, platform-wide (not scoped to them — donations go to whoever requests first).
      const available = getAvailableDonations();
      // "My requests" — a farmer already accepted and scheduled a pickup date; the ball is
      // now in THIS stakeholder's court to actually go collect it.
      const myRequests = getDonationsForStakeholder(stakeholderId);
      if (!cancelled) {
        setDonationsBadge(available.length);
        setRequestsBadge(myRequests.filter((donation) => donation.status === 'scheduled').length);
      }

      // "My orders" — a stakeholder is just a buyer by order-row ownership when they check
      // out through the marketplace, so the same "needs payment or receipt confirmation"
      // rule applies (see useBuyerNavBadges.js).
      getOrdersByBuyer(stakeholderId)
        .then((orders) => {
          if (!cancelled) setOrdersBadge(orders.filter(needsBuyerAction).length);
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
  }, [stakeholderId]);

  return { donationsBadge, requestsBadge, ordersBadge };
}
