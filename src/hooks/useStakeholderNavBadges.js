import { useEffect, useState } from 'react';
import { getAvailableDonations, getDonationsForStakeholder } from '../services/donationService';
import { getOrdersByBuyer } from '../services/orderService';
import { getExpiryStatus } from '../utils/constants';
import { needsBuyerAction } from './useBuyerNavBadges';

const POLL_INTERVAL_MS = 6000;



export function useStakeholderNavBadges(stakeholderId) {
  const [donationsBadge, setDonationsBadge] = useState(0);
  const [requestsBadge, setRequestsBadge] = useState(0);
  const [ordersBadge, setOrdersBadge] = useState(0);

  useEffect(() => {
    if (!stakeholderId) return undefined;
    let cancelled = false;
    const refresh = () => {








      Promise.all([getAvailableDonations(), getDonationsForStakeholder(stakeholderId)]).then(([available, myRequests]) => {
        if (cancelled) return;
        setDonationsBadge(available.filter((donation) => getExpiryStatus(donation.expirationDate)).length);
        setRequestsBadge(myRequests.filter((donation) => donation.status === 'scheduled').length);
      }).catch(() => {});




      getOrdersByBuyer(stakeholderId)
        .then((orders) => {
          if (!cancelled) setOrdersBadge(orders.filter(needsBuyerAction).length);
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
  }, [stakeholderId]);

  return { donationsBadge, requestsBadge, ordersBadge };
}
