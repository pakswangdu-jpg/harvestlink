import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { getSocket } from '../lib/socketClient';

// How long after the last keystroke we tell the other side we've stopped — not on every
// keyup, so this doesn't flood the socket while someone's mid-sentence.
const STOP_TYPING_DELAY_MS = 2000;
// Safety auto-clear if a stop-typing event is ever dropped (tab closed mid-type, etc.) —
// without this, "X is typing…" could get stuck on indefinitely.
const REMOTE_TYPING_TIMEOUT_MS = 4000;

// Real-time typing indicator for one open conversation (see backend/src/realtime/
// chatPresence.js) — purely additive alongside the existing REST send/poll flow.
export function useChatTyping(otherUserId) {
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const stopTimerRef = useRef(null);
  const remoteTimeoutRef = useRef(null);

  useEffect(() => {
    if (!otherUserId) return undefined;
    let cancelled = false;
    const socket = getSocket();

    const join = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled || !session?.access_token) return;
      socket.emit('join-chat', { otherUserId, token: session.access_token }, () => {});
    };
    join();
    socket.on('connect', join);

    const handleTyping = ({ fromUserId }) => {
      if (fromUserId !== otherUserId) return;
      setIsOtherTyping(true);
      clearTimeout(remoteTimeoutRef.current);
      remoteTimeoutRef.current = setTimeout(() => setIsOtherTyping(false), REMOTE_TYPING_TIMEOUT_MS);
    };
    const handleStopTyping = ({ fromUserId }) => {
      if (fromUserId !== otherUserId) return;
      clearTimeout(remoteTimeoutRef.current);
      setIsOtherTyping(false);
    };
    socket.on('typing', handleTyping);
    socket.on('stop-typing', handleStopTyping);

    return () => {
      cancelled = true;
      socket.off('connect', join);
      socket.off('typing', handleTyping);
      socket.off('stop-typing', handleStopTyping);
      clearTimeout(remoteTimeoutRef.current);
    };
  }, [otherUserId]);

  const notifyTyping = () => {
    if (!otherUserId) return;
    const socket = getSocket();
    socket.emit('typing', { otherUserId });
    clearTimeout(stopTimerRef.current);
    stopTimerRef.current = setTimeout(() => socket.emit('stop-typing', { otherUserId }), STOP_TYPING_DELAY_MS);
  };

  const notifyStoppedTyping = () => {
    if (!otherUserId) return;
    clearTimeout(stopTimerRef.current);
    getSocket().emit('stop-typing', { otherUserId });
  };

  return { isOtherTyping, notifyTyping, notifyStoppedTyping };
}
