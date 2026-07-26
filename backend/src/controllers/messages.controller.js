import { supabaseAdmin } from '../lib/supabaseClient.js';
import { serializeMessage } from '../lib/serialize.js';
import { createNotification } from '../lib/notify.js';
import { ApiError } from '../lib/ApiError.js';

const DEFAULT_PAGE_SIZE = 30;

async function assertDirectRecipient(recipientId, senderId) {
  if (recipientId === senderId) throw new ApiError('You cannot message yourself.', 400);
  const { data, error } = await supabaseAdmin.from('profiles').select('id, role').eq('id', recipientId).single();
  if (error || !data) throw new ApiError('Recipient was not found.', 404);
  if (data.role === 'admin') throw new ApiError('You cannot message an admin account.', 400);
}

// Every order id shared between exactly these two accounts (either direction) — a
// buyer/farmer pair only ever has ONE conversation, so any order-scoped messages between
// them merge into the same thread as their direct messages, never split out per order.
async function sharedOrderIds(userIdA, userIdB) {
  const { data, error } = await supabaseAdmin
    .from('orders')
    .select('id')
    .or(`and(buyer_id.eq.${userIdA},farmer_id.eq.${userIdB}),and(buyer_id.eq.${userIdB},farmer_id.eq.${userIdA})`);
  if (error) throw new ApiError(error.message, 400);
  return data.map((order) => order.id);
}

// GET /api/messages?otherUserId=&before=&limit= — the ONE merged conversation with that
// person: their direct messages plus any order-scoped messages from orders between exactly
// this pair, all in one continuous, cursor-paginated thread. `before` is a message's
// created_at ISO timestamp; omit it for the most recent page.
export async function listMessages(req, res) {
  const { otherUserId, before, limit } = req.query;
  if (!otherUserId) throw new ApiError('otherUserId is required.', 400);
  const pageSize = Math.min(Number(limit) || DEFAULT_PAGE_SIZE, 100);

  const orderIds = await sharedOrderIds(req.profile.id, otherUserId);
  const filters = [
    `and(order_id.is.null,sender_id.eq.${req.profile.id},recipient_id.eq.${otherUserId})`,
    `and(order_id.is.null,sender_id.eq.${otherUserId},recipient_id.eq.${req.profile.id})`,
  ];
  if (orderIds.length) filters.push(`order_id.in.(${orderIds.join(',')})`);

  let query = supabaseAdmin.from('messages').select('*').or(filters.join(','));
  if (before) query = query.lt('created_at', before);
  const { data, error } = await query.order('created_at', { ascending: false }).limit(pageSize);
  if (error) throw new ApiError(error.message, 400);
  res.json({ messages: data.reverse().map(serializeMessage), hasMore: data.length === pageSize });
}

// GET /api/messages/direct-threads — every conversation the caller is part of, one row per
// counterpart, newest activity first. A counterpart's row merges their direct messages AND
// any order-scoped messages between exactly this pair — the inbox always shows ONE entry
// per person, never one per order.
export async function listDirectThreads(req, res) {
  const { data: orders, error: ordersError } = await supabaseAdmin
    .from('orders')
    .select('id, buyer_id, farmer_id')
    .or(`buyer_id.eq.${req.profile.id},farmer_id.eq.${req.profile.id}`);
  if (ordersError) throw new ApiError(ordersError.message, 400);

  const counterpartByOrderId = new Map();
  const orderIds = orders.map((order) => {
    counterpartByOrderId.set(order.id, order.buyer_id === req.profile.id ? order.farmer_id : order.buyer_id);
    return order.id;
  });

  const filters = [
    `and(order_id.is.null,sender_id.eq.${req.profile.id})`,
    `and(order_id.is.null,recipient_id.eq.${req.profile.id})`,
  ];
  if (orderIds.length) filters.push(`order_id.in.(${orderIds.join(',')})`);

  const { data, error } = await supabaseAdmin
    .from('messages')
    .select('*')
    .or(filters.join(','))
    .order('created_at', { ascending: false });
  if (error) throw new ApiError(error.message, 400);

  const rowsByPartnerId = new Map();
  data.forEach((row) => {
    const partnerId = row.order_id
      ? counterpartByOrderId.get(row.order_id)
      : (row.sender_id === req.profile.id ? row.recipient_id : row.sender_id);
    if (!partnerId) return; // an order/message this account no longer has visibility into
    if (!rowsByPartnerId.has(partnerId)) rowsByPartnerId.set(partnerId, []);
    rowsByPartnerId.get(partnerId).push(row);
  });

  const partnerIds = [...rowsByPartnerId.keys()];
  if (!partnerIds.length) return res.json([]);

  const { data: partners } = await supabaseAdmin
    .from('profiles')
    .select('id, name, role, farm_name, organization_name, avatar_url, last_active_at, verification_status')
    .in('id', partnerIds);
  const partnerById = new Map((partners || []).map((partner) => [partner.id, partner]));

  const threads = partnerIds.map((partnerId) => {
    const rows = rowsByPartnerId.get(partnerId); // already newest-first
    const partner = partnerById.get(partnerId);
    const unreadCount = rows.filter((row) => row.sender_id !== req.profile.id && !row.read).length;
    return {
      otherUserId: partnerId,
      // Deactivated/deleted accounts can still have message history — fall back to a
      // plain label instead of leaving a blank name.
      otherUserName: partner ? (partner.organization_name || partner.farm_name || partner.name) : 'Former user',
      otherUserAvatarUrl: partner?.avatar_url || null,
      otherUserLastActiveAt: partner?.last_active_at || null,
      otherUserVerified: partner?.verification_status === 'verified',
      lastMessage: serializeMessage(rows[0]),
      unreadCount,
    };
  });

  threads.sort((a, b) => new Date(b.lastMessage.createdAt) - new Date(a.lastMessage.createdAt));
  res.json(threads);
}

// POST /api/messages — body { recipientId, text } for a plain text message, or the same
// plus { messageType: 'image'|'file', imageUrl, fileUrl, fileName, replyToId } for an
// attachment/reply. Every new message is sent as a direct (order_id null) row — the ONE
// conversation with that person keeps going regardless of which (if any) order it's about;
// past order-scoped rows still merge into the same thread via listMessages/listDirectThreads
// above. sender_name/sender_role are snapshotted from the authenticated caller's own
// profile, never taken from the request body.
export async function sendMessage(req, res) {
  const {
    recipientId, text, messageType, imageUrl, fileUrl, fileName, replyToId,
  } = req.body;
  if (!recipientId) throw new ApiError('recipientId is required.', 400);
  const trimmed = String(text || '').trim();
  const type = messageType === 'image' || messageType === 'file' ? messageType : 'text';
  if (type === 'text' && !trimmed) throw new ApiError('Enter a message before sending.', 400);
  if (type === 'image' && !imageUrl) throw new ApiError('imageUrl is required for an image message.', 400);
  if (type === 'file' && !fileUrl) throw new ApiError('fileUrl is required for a file message.', 400);
  if (req.profile.role === 'admin') throw new ApiError('Admin accounts cannot send messages.', 403);

  await assertDirectRecipient(recipientId, req.profile.id);
  const { data, error } = await supabaseAdmin.from('messages').insert({
    recipient_id: recipientId,
    sender_id: req.profile.id,
    sender_name: req.profile.name,
    sender_role: req.profile.role,
    text: trimmed,
    message_type: type,
    image_url: type === 'image' ? imageUrl : null,
    file_url: type === 'file' ? fileUrl : null,
    file_name: type === 'file' ? (fileName || null) : null,
    reply_to_id: replyToId || null,
  }).select().single();
  if (error) throw new ApiError(error.message, 400);

  // A short, honest preview of what was actually sent — never the full message body for a
  // long text (matches every other push/notification preview convention in the app).
  const preview = type === 'image'
    ? 'Sent a photo'
    : type === 'file'
      ? `Sent a file: ${fileName || 'attachment'}`
      : trimmed.length > 120 ? `${trimmed.slice(0, 120)}…` : trimmed;
  await createNotification({
    userId: recipientId,
    type: 'message',
    title: `New message from ${req.profile.name}`,
    message: preview,
    link: `/messages/direct/${req.profile.id}`,
  });

  res.status(201).json(serializeMessage(data));
}

async function fetchOwnMessageOr404(messageId, senderId) {
  const { data, error } = await supabaseAdmin.from('messages').select('*').eq('id', messageId).single();
  if (error || !data) throw new ApiError('Message was not found.', 404);
  if (data.sender_id !== senderId) throw new ApiError('You can only edit or delete your own messages.', 403);
  if (data.deleted) throw new ApiError('This message was already deleted.', 400);
  return data;
}

// PATCH /api/messages/message/:messageId — body { text }. Text messages only (an image/file
// caption isn't editable here, matching most messengers' own "edit" scope).
export async function editMessage(req, res) {
  const message = await fetchOwnMessageOr404(req.params.messageId, req.profile.id);
  if (message.message_type !== 'text') throw new ApiError('Only text messages can be edited.', 400);
  const trimmed = String(req.body.text || '').trim();
  if (!trimmed) throw new ApiError('Enter a message before sending.', 400);

  const { data, error } = await supabaseAdmin
    .from('messages')
    .update({ text: trimmed, edited: true })
    .eq('id', message.id)
    .select()
    .single();
  if (error) throw new ApiError(error.message, 400);
  res.json(serializeMessage(data));
}

// DELETE /api/messages/message/:messageId — soft delete: clears the content but keeps the
// row (and its id) in place, so the thread can render "This message was deleted" instead of
// a silent gap, and anything replying to it still resolves.
export async function deleteMessage(req, res) {
  const message = await fetchOwnMessageOr404(req.params.messageId, req.profile.id);

  const { data, error } = await supabaseAdmin
    .from('messages')
    .update({
      deleted: true, text: '', image_url: null, file_url: null, file_name: null,
    })
    .eq('id', message.id)
    .select()
    .single();
  if (error) throw new ApiError(error.message, 400);
  res.json(serializeMessage(data));
}

// PATCH /api/messages/direct/:otherUserId/read — marks every message in the ONE merged
// conversation with that person (direct + any shared orders' messages) NOT sent by the
// caller as read ("I've seen the other party's messages").
export async function markDirectThreadRead(req, res) {
  const { otherUserId } = req.params;
  const orderIds = await sharedOrderIds(req.profile.id, otherUserId);

  const filters = [`and(order_id.is.null,sender_id.eq.${otherUserId},recipient_id.eq.${req.profile.id})`];
  if (orderIds.length) filters.push(`and(order_id.in.(${orderIds.join(',')}),sender_id.eq.${otherUserId})`);

  const { error } = await supabaseAdmin
    .from('messages')
    .update({ read: true })
    .or(filters.join(','))
    .eq('read', false);
  if (error) throw new ApiError(error.message, 400);
  res.status(204).end();
}
