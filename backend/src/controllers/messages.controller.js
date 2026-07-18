import { supabaseAdmin } from '../lib/supabaseClient.js';
import { serializeMessage } from '../lib/serialize.js';
import { ApiError } from '../lib/ApiError.js';

async function fetchOrderOr404(orderId) {
  const { data, error } = await supabaseAdmin.from('orders').select('id, buyer_id, farmer_id').eq('id', orderId).single();
  if (error || !data) throw new ApiError('Order was not found.', 404);
  return data;
}

// Order threads are scoped to an order — only that order's buyer/farmer (or an admin)
// may read or post into its thread.
function assertOrderParty(req, order) {
  const isAdmin = req.profile.role === 'admin';
  const isBuyer = req.profile.id === order.buyer_id;
  const isFarmer = req.profile.id === order.farmer_id;
  if (!isAdmin && !isBuyer && !isFarmer) throw new ApiError('You do not have permission to view this conversation.', 403);
}

async function assertDirectRecipient(recipientId, senderId) {
  if (recipientId === senderId) throw new ApiError('You cannot message yourself.', 400);
  const { data, error } = await supabaseAdmin.from('profiles').select('id, role').eq('id', recipientId).single();
  if (error || !data) throw new ApiError('Recipient was not found.', 404);
  if (data.role === 'admin') throw new ApiError('You cannot message an admin account.', 400);
}

// GET /api/messages?orderId= (order thread) or ?otherUserId= (direct conversation with
// that specific account — order_id is null on these rows, see supabase/schema.sql).
export async function listMessages(req, res) {
  const { orderId, otherUserId } = req.query;

  if (orderId) {
    const order = await fetchOrderOr404(orderId);
    assertOrderParty(req, order);
    const { data, error } = await supabaseAdmin
      .from('messages')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true });
    if (error) throw new ApiError(error.message, 400);
    return res.json(data.map(serializeMessage));
  }

  if (otherUserId) {
    const { data, error } = await supabaseAdmin
      .from('messages')
      .select('*')
      .is('order_id', null)
      .or(`and(sender_id.eq.${req.profile.id},recipient_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},recipient_id.eq.${req.profile.id})`)
      .order('created_at', { ascending: true });
    if (error) throw new ApiError(error.message, 400);
    return res.json(data.map(serializeMessage));
  }

  throw new ApiError('orderId or otherUserId is required.', 400);
}

// GET /api/messages/direct-threads — every direct (non-order) conversation the caller is
// part of, one row per conversation partner, newest message first. Backs the "Messages"
// inbox so a conversation started from the map (or anywhere else) stays findable afterward
// instead of only being reachable by re-clicking that person's pin.
export async function listDirectThreads(req, res) {
  const { data, error } = await supabaseAdmin
    .from('messages')
    .select('*')
    .is('order_id', null)
    .or(`sender_id.eq.${req.profile.id},recipient_id.eq.${req.profile.id}`)
    .order('created_at', { ascending: false });
  if (error) throw new ApiError(error.message, 400);

  const rowsByPartnerId = new Map();
  data.forEach((row) => {
    const partnerId = row.sender_id === req.profile.id ? row.recipient_id : row.sender_id;
    if (!rowsByPartnerId.has(partnerId)) rowsByPartnerId.set(partnerId, []);
    rowsByPartnerId.get(partnerId).push(row);
  });

  const partnerIds = [...rowsByPartnerId.keys()];
  if (!partnerIds.length) return res.json([]);

  const { data: partners } = await supabaseAdmin
    .from('profiles')
    .select('id, name, role, farm_name, organization_name')
    .in('id', partnerIds);
  const partnerById = new Map((partners || []).map((partner) => [partner.id, partner]));

  const threads = partnerIds.map((partnerId) => {
    const rows = rowsByPartnerId.get(partnerId); // already newest-first
    const partner = partnerById.get(partnerId);
    const unreadCount = rows.filter((row) => row.sender_id === partnerId && !row.read).length;
    return {
      otherUserId: partnerId,
      // Deactivated/deleted accounts can still have message history — fall back to a
      // plain label instead of leaving a blank name.
      otherUserName: partner ? (partner.organization_name || partner.farm_name || partner.name) : 'Former user',
      lastMessage: serializeMessage(rows[0]),
      unreadCount,
    };
  });

  threads.sort((a, b) => new Date(b.lastMessage.createdAt) - new Date(a.lastMessage.createdAt));
  res.json(threads);
}

// POST /api/messages — body { orderId, text } for an order thread, or { recipientId, text }
// for a direct conversation. sender_name/sender_role are snapshotted from the authenticated
// caller's own profile, never taken from the request body.
export async function sendMessage(req, res) {
  const { orderId, recipientId, text } = req.body;
  const trimmed = String(text || '').trim();
  if (!trimmed) throw new ApiError('Enter a message before sending.', 400);
  if (req.profile.role === 'admin') throw new ApiError('Admin accounts cannot send messages.', 403);

  if (orderId) {
    const order = await fetchOrderOr404(orderId);
    assertOrderParty(req, order);
    const row = {
      order_id: orderId,
      sender_id: req.profile.id,
      sender_name: req.profile.name,
      sender_role: req.profile.role,
      text: trimmed,
    };
    const { data, error } = await supabaseAdmin.from('messages').insert(row).select().single();
    if (error) throw new ApiError(error.message, 400);
    return res.status(201).json(serializeMessage(data));
  }

  if (recipientId) {
    await assertDirectRecipient(recipientId, req.profile.id);
    const row = {
      recipient_id: recipientId,
      sender_id: req.profile.id,
      sender_name: req.profile.name,
      sender_role: req.profile.role,
      text: trimmed,
    };
    const { data, error } = await supabaseAdmin.from('messages').insert(row).select().single();
    if (error) throw new ApiError(error.message, 400);
    return res.status(201).json(serializeMessage(data));
  }

  throw new ApiError('orderId or recipientId is required.', 400);
}

// PATCH /api/messages/:orderId/read — marks every message in this order thread NOT sent by
// the caller as read ("I've seen the other party's messages").
export async function markThreadRead(req, res) {
  const { orderId } = req.params;
  const order = await fetchOrderOr404(orderId);
  assertOrderParty(req, order);

  const { error } = await supabaseAdmin
    .from('messages')
    .update({ read: true })
    .eq('order_id', orderId)
    .neq('sender_id', req.profile.id)
    .eq('read', false);
  if (error) throw new ApiError(error.message, 400);
  res.status(204).end();
}

// PATCH /api/messages/direct/:otherUserId/read — same idea, for a direct conversation.
export async function markDirectThreadRead(req, res) {
  const { otherUserId } = req.params;

  const { error } = await supabaseAdmin
    .from('messages')
    .update({ read: true })
    .is('order_id', null)
    .eq('sender_id', otherUserId)
    .eq('recipient_id', req.profile.id)
    .eq('read', false);
  if (error) throw new ApiError(error.message, 400);
  res.status(204).end();
}
