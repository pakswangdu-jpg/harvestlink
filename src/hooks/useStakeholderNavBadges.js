import { useEffect, useState } from 'react';
import { getAvailableDonations, getDonationsForStakeholder } from '../services/donationService';
import { getOrdersByBuyer } from '../services/orderService';
import { getExpiryStatus } from '../utils/constants';
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
      // "Browse donations" — platform-wide (not scoped to them — donations go to whoever
      // requests first), but only the ones actually worth an alert: available surplus that's
      // expiring soon or already past its date. A plain "new donations exist" count would sit
      // at odds with every other badge in this app, which all mean "something needs YOUR
      // decision now" — an ordinary available donation with no urgency doesn't qualify, but
      // one about to spoil does.
      const available = getAvailableDonations();
      const urgent = available.filter((donation) => getExpiryStatus(donation.expirationDate));
      // "My requests" — a farmer already accepted and scheduled a pickup date; the ball is
      // now in THIS stakeholder's court to actually go collect it.
      const myRequests = getDonationsForStakeholder(stakeholderId);
      if (!cancelled) {
        setDonationsBadge(urgent.length);
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
