import { apiClient } from './apiClient';







export async function getDirectMessages(otherUserId, { before, limit } = {}) {
  const params = new URLSearchParams({ otherUserId });
  if (before) params.set('before', before);
  if (limit) params.set('limit', String(limit));
  return apiClient.get(`/messages?${params.toString()}`);
}


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



export async function getDirectThreads() {
  return apiClient.get('/messages/direct-threads');
}
