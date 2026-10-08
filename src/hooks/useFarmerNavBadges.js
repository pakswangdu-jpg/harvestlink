import { useEffect, useState } from 'react';
import { getOrdersByFarmer } from '../services/orderService';
import { getDonationsByFarmer } from '../services/donationService';

const POLL_INTERVAL_MS = 6000;








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

        });


      getDonationsByFarmer(farmerId).then((donations) => {
        if (!cancelled) setDonationsBadge(donations.filter((donation) => donation.status === 'requested').length);
      }).catch(() => {});
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
