import { useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { mapNotificationRealtimeRow } from '../services/notificationService';





export function useNotificationsRealtime(userId, onInsert) {
  useEffect(() => {
    if (!userId) return undefined;
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => onInsert(mapNotificationRealtimeRow(payload.new))
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);
}
