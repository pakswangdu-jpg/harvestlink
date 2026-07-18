import { useEffect, useState } from 'react';
import { getOrdersByFarmer } from '../services/orderService';
import { getDonationsByFarmer } from '../services/donationService';

const POLL_INTERVAL_MS = 6000;

// Mirrors the admin sidebar's "pending queue" badges (see AdminDashboard.jsx's
// navItemsWithBadges) — surfaces the two things actually waiting on THIS farmer's own
// decision (new orders to confirm/reject, donation requests to accept/decline), not general
// monitoring views like Products/Market Insights. Mounted at the app-shell level rather than
// inside one page component, so — unlike the admin version, which only computes while
// AdminDashboard.jsx happens to be mounted — this stays accurate no matter which farmer page
// is open (same reasoning as useFarmerActiveDeliverySharing).
export function useFarmerNavBadges(farmerId) {
  const [ordersBadge, setOrdersBadge] = useState(0);
  const [donationsBadge, setDonationsBadge] = useState(0);

  useEffect(() => {
    if (!farmerId) return undefined;
    let cancelled = false;
    const refresh = () => {
      getOrdersByFarmer(farmerId)
        .then((orders) => {
          if (cancelled) return;
          setOrdersBadge(orders.filter((order) => order.status === 'pending').length);
        })
        .catch(() => {
          // A transient failure here just skips this tick — the next poll retries.
        });
      // Donations are still localStorage-backed (see donationService.js), not a network
      // call, so this is a cheap synchronous read to redo on every tick.
      const donations = getDonationsByFarmer(farmerId);
      if (!cancelled) setDonationsBadge(donations.filter((donation) => donation.status === 'requested').length);
    };
    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [farmerId]);

  return { ordersBadge, donationsBadge };
}
