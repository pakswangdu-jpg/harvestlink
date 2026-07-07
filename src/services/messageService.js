import { STORAGE_KEYS } from '../utils/constants';
import { createId, readStorage, writeStorage } from './storageService';

export function getMessages() {
  return readStorage(STORAGE_KEYS.messages, []);
}

export function saveMessages(messages) {
  return writeStorage(STORAGE_KEYS.messages, messages);
}

export function getMessagesForOrder(orderId) {
  return getMessages()
    .filter((message) => message.orderId === orderId)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

export function sendMessage(order, sender, text) {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Enter a message before sending.');

  const message = {
    id: createId('msg'),
    orderId: order.id,
    senderId: sender.id,
    senderName: sender.name,
    senderRole: sender.role,
    text: trimmed,
    read: false,
    createdAt: new Date().toISOString(),
  };

  saveMessages([...getMessages(), message]);
  return message;
}

export function markThreadRead(orderId, readerId) {
  const messages = getMessages();
  const updated = messages.map((message) =>
    message.orderId === orderId && message.senderId !== readerId ? { ...message, read: true } : message
  );
  saveMessages(updated);
}

export function getThreadsForOrders(orders, currentUser) {
  return orders
    .map((order) => {
      const messages = getMessagesForOrder(order.id);
      const lastMessage = messages[messages.length - 1] || null;
      const unreadCount = messages.filter((message) => message.senderId !== currentUser.id && !message.read).length;
      const otherPartyName = currentUser.role === 'farmer' ? order.buyerName : order.farmerName;
      return { order, lastMessage, unreadCount, otherPartyName };
    })
    .sort((a, b) => {
      const aTime = new Date(a.lastMessage?.createdAt || a.order.createdAt).getTime();
      const bTime = new Date(b.lastMessage?.createdAt || b.order.createdAt).getTime();
      return bTime - aTime;
    });
}
