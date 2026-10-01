import { useEffect, useState } from 'react';
import { getUsers } from '../services/authService';
import { getPendingPriceReviews } from '../services/productService';

const POLL_INTERVAL_MS = 6000;






export function useAdminNavBadges(isAdmin) {
  const [usersBadge, setUsersBadge] = useState(0);
  const [priceMonitoringBadge, setPriceMonitoringBadge] = useState(0);

  useEffect(() => {
    if (!isAdmin) return undefined;
    let cancelled = false;
    const refresh = () => {
      getUsers()
        .then((users) => {
          if (cancelled) return;
          setUsersBadge(users.filter((user) => user.verificationStatus === 'pending').length);
        })
        .catch(() => {});
      getPendingPriceReviews()
        .then((reviews) => {
          if (cancelled) return;
          setPriceMonitoringBadge(reviews.length);
        })
        .catch(() => {});
    };
    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isAdmin]);

  return { usersBadge, priceMonitoringBadge };
}
