import { apiClient } from './apiClient';

export async function getMessagesForOrder(orderId) {
  return apiClient.get(`/messages?orderId=${orderId}`);
}

export async function sendMessage(order, sender, text) {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Enter a message before sending.');
  return apiClient.post('/messages', { orderId: order.id, text: trimmed });
}

export async function markThreadRead(orderId) {
  return apiClient.patch(`/messages/${orderId}/read`, {});
}

export async function getThreadsForOrders(orders, currentUser) {
  const threads = await Promise.all(
    orders.map(async (order) => {
      const messages = await getMessagesForOrder(order.id);
      const lastMessage = messages[messages.length - 1] || null;
      const unreadCount = messages.filter((message) => message.senderId !== currentUser.id && !message.read).length;
      const otherPartyName = currentUser.role === 'farmer' ? order.buyerName : order.farmerName;
      return { order, lastMessage, unreadCount, otherPartyName };
    })
  );

  return threads.sort((a, b) => {
    const aTime = new Date(a.lastMessage?.createdAt || a.order.createdAt).getTime();
    const bTime = new Date(b.lastMessage?.createdAt || b.order.createdAt).getTime();
    return bTime - aTime;
  });
}

// A direct conversation isn't tied to any order — this is how farmers, buyers, and
// stakeholders can contact each other from the map (or anywhere else) before any order
// exists between them. Same messages table, just order_id null / recipientId set instead
// (see supabase/schema.sql and backend/src/controllers/messages.controller.js).
export async function getDirectMessages(otherUserId) {
  return apiClient.get(`/messages?otherUserId=${otherUserId}`);
}

export async function sendDirectMessage(recipientId, text) {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Enter a message before sending.');
  return apiClient.post('/messages', { recipientId, text: trimmed });
}

export async function markDirectThreadRead(otherUserId) {
  return apiClient.patch(`/messages/direct/${otherUserId}/read`, {});
}

// Every direct conversation the caller is part of, one entry per partner, newest first —
// backs the "Messages" inbox alongside order threads.
export async function getDirectThreads() {
  return apiClient.get('/messages/direct-threads');
}
