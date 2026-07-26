import { useEffect, useState } from 'react';
import { getDirectThreads } from '../services/messageService';

const POLL_INTERVAL_MS = 6000;

// Shared by all three roles (farmer/buyer/stakeholder) — "Messages" sits in every one of
// their sidebars, and unread mail works identically regardless of role, unlike the other
// per-role badges (orders/donations/requests). Mirrors useFarmerNavBadges.js's mount-at-
// app-shell-level reasoning, so the badge stays accurate no matter which page is open, not
// just while the Messages page itself happens to be mounted.
export function useMessagesBadge(userId) {
  const [messagesBadge, setMessagesBadge] = useState(0);

  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;
    const refresh = () => {
      getDirectThreads()
        .then((threads) => {
          if (cancelled) return;
          setMessagesBadge(threads.reduce((sum, thread) => sum + (thread.unreadCount || 0), 0));
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
  }, [userId]);

  return { messagesBadge };
}
