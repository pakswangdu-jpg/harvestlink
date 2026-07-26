import { apiClient } from './apiClient';

// A buyer/farmer pair only ever has ONE conversation — merging their direct messages with
// any order-scoped history between exactly that pair (see backend/src/controllers/
// messages.controller.js) — so every call here is keyed by the OTHER PERSON, never by
// order. { messages, hasMore } — newest page when `before` is omitted, ascending within
// the page. `before` is a message's createdAt ISO string (the oldest one currently loaded)
// to fetch the next older page for infinite scroll.
export async function getDirectMessages(otherUserId, { before, limit } = {}) {
  const params = new URLSearchParams({ otherUserId });
  if (before) params.set('before', before);
  if (limit) params.set('limit', String(limit));
  return apiClient.get(`/messages?${params.toString()}`);
}

// `extra` carries an attachment/reply: { messageType, imageUrl, fileUrl, fileName, replyToId }.
export async function sendDirectMessage(recipientId, text, extra = {}) {
  const trimmed = text.trim();
  if (!trimmed && !extra.imageUrl && !extra.fileUrl) throw new Error('Enter a message before sending.');
  return apiClient.post('/messages', { recipientId, text: trimmed, ...extra });
}

export async function editMessage(messageId, text) {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Enter a message before sending.');
  return apiClient.patch(`/messages/message/${messageId}`, { text: trimmed });
}

export async function deleteMessage(messageId) {
  return apiClient.delete(`/messages/message/${messageId}`);
}

export async function markDirectThreadRead(otherUserId) {
  return apiClient.patch(`/messages/direct/${otherUserId}/read`, {});
}

// Every conversation the caller is part of — one row per person, newest activity first
// (backs the "Messages" inbox).
export async function getDirectThreads() {
  return apiClient.get('/messages/direct-threads');
}
