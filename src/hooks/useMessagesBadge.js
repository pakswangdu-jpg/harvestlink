import { useEffect, useState } from 'react';
import { getDirectThreads } from '../services/messageService';

const POLL_INTERVAL_MS = 6000;






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
