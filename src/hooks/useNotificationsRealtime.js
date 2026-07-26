import { useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { mapNotificationRealtimeRow } from '../services/notificationService';

// Supabase Realtime pushes a new notification the instant the backend inserts it (see the
// notifications_select_own RLS policy + supabase_realtime publication in schema.sql), same
// pattern as OrderTracking.jsx's live GPS updates. `onInsert` is called with the new
// notification already mapped to the frontend's usual camelCase shape.
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
