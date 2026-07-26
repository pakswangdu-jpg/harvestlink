import { supabaseAdmin } from '../lib/supabaseClient.js';

// Real-time "X is typing…" for the Messages page — purely additive alongside the existing
// REST-based message send/poll flow (backend/src/controllers/messages.controller.js), which
// keeps working exactly as before. Attaches a second 'connection' listener to the SAME io
// instance orderTracking.js already created (Socket.IO/Node's EventEmitter supports more
// than one listener per event), so this never touches — and can't break — GPS sharing.
const ROOM_PREFIX = 'chat:';

// Deterministic regardless of who joins first, so both sides of a conversation land in the
// exact same room.
function chatRoomId(userIdA, userIdB) {
  return ROOM_PREFIX + [userIdA, userIdB].sort().join(':');
}

async function verifyUser(token) {
  if (!token) return null;
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData?.user) return null;
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id, account_status')
    .eq('id', userData.user.id)
    .single();
  if (!profile || profile.account_status === 'suspended') return null;
  return profile.id;
}

export function setupChatSocket(io) {
  io.on('connection', (socket) => {
    // A single socket can be mid-conversation with more than one person at once (e.g. two
    // browser tabs on different threads) — tracked as a set of rooms, same shape as
    // orderTracking.js's socket.data.orderIds.
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
      // socket.to (not io.to) — broadcasts to everyone else in the room, never echoes the
      // typing event back to the person who's actually typing.
      socket.to(chatRoomId(userId, otherUserId)).emit('typing', { fromUserId: userId });
    });

    socket.on('stop-typing', ({ otherUserId } = {}) => {
      const userId = socket.data.userId;
      if (!userId || !otherUserId || !socket.data.chatRooms?.has(chatRoomId(userId, otherUserId))) return;
      socket.to(chatRoomId(userId, otherUserId)).emit('stop-typing', { fromUserId: userId });
    });
  });
}
