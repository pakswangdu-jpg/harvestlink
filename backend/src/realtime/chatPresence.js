import { supabaseAdmin } from '../lib/supabaseClient.js';
import { assertAccountActive } from '../lib/accountInactivity.js';






const ROOM_PREFIX = 'chat:';



function chatRoomId(userIdA, userIdB) {
  return ROOM_PREFIX + [userIdA, userIdB].sort().join(':');
}

async function verifyUser(token) {
  if (!token) return null;
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData?.user) return null;
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id, role, account_status, last_active_at, created_at, inactivity_suspended_at')
    .eq('id', userData.user.id)
    .single();
  if (!profile) return null;
  try { await assertAccountActive(profile); } catch { return null; }
  return profile.id;
}

export function setupChatSocket(io) {
  io.on('connection', (socket) => {



    socket.on('join-chat', async ({ otherUserId, token } = {}, ack) => {
      const userId = await verifyUser(token);
      if (!userId || !otherUserId) {
        ack?.({ ok: false, error: 'Not authorized to join this conversation.' });
        return;
      }
      socket.data.userId = userId;
      if (!socket.data.chatRooms) socket.data.chatRooms = new Set();
      const room = chatRoomId(userId, otherUserId);
      socket.data.chatRooms.add(room);
      socket.join(room);
      ack?.({ ok: true });
    });

    socket.on('typing', ({ otherUserId } = {}) => {
      const userId = socket.data.userId;
      if (!userId || !otherUserId || !socket.data.chatRooms?.has(chatRoomId(userId, otherUserId))) return;


      socket.to(chatRoomId(userId, otherUserId)).emit('typing', { fromUserId: userId });
    });

    socket.on('stop-typing', ({ otherUserId } = {}) => {
      const userId = socket.data.userId;
      if (!userId || !otherUserId || !socket.data.chatRooms?.has(chatRoomId(userId, otherUserId))) return;
      socket.to(chatRoomId(userId, otherUserId)).emit('stop-typing', { fromUserId: userId });
    });
  });
}
