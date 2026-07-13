import { supabaseAdmin } from '../lib/supabaseClient.js';
import { serializeMessage } from '../lib/serialize.js';
import { ApiError } from '../lib/ApiError.js';

async function fetchOrderOr404(orderId) {
  const { data, error } = await supabaseAdmin.from('orders').select('id, buyer_id, farmer_id').eq('id', orderId).single();
  if (error || !data) throw new ApiError('Order was not found.', 404);
  return data;
}

// Messaging is always scoped to an order — only that order's buyer/farmer (or an admin)
// may read or post into its thread.
function assertParty(req, order) {
  const isAdmin = req.profile.role === 'admin';
  const isBuyer = req.profile.id === order.buyer_id;
  const isFarmer = req.profile.id === order.farmer_id;
  if (!isAdmin && !isBuyer && !isFarmer) throw new ApiError('You do not have permission to view this conversation.', 403);
}

// GET /api/messages?orderId=
export async function listMessages(req, res) {
  const { orderId } = req.query;
  if (!orderId) throw new ApiError('orderId is required.', 400);
  const order = await fetchOrderOr404(orderId);
  assertParty(req, order);

  const { data, error } = await supabaseAdmin
    .from('messages')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true });
  if (error) throw new ApiError(error.message, 400);
  res.json(data.map(serializeMessage));
}

// POST /api/messages — body { orderId, text }. sender_name/sender_role are snapshotted
// from the authenticated caller's own profile, never taken from the request body.
export async function sendMessage(req, res) {
  const { orderId, text } = req.body;
  if (!orderId) throw new ApiError('orderId is required.', 400);
  const trimmed = String(text || '').trim();
  if (!trimmed) throw new ApiError('Enter a message before sending.', 400);

  const order = await fetchOrderOr404(orderId);
  assertParty(req, order);
  if (req.profile.role === 'admin') throw new ApiError('Admin accounts cannot send messages.', 403);

  const row = {
    order_id: orderId,
    sender_id: req.profile.id,
    sender_name: req.profile.name,
    sender_role: req.profile.role,
    text: trimmed,
  };
  const { data, error } = await supabaseAdmin.from('messages').insert(row).select().single();
  if (error) throw new ApiError(error.message, 400);
  res.status(201).json(serializeMessage(data));
}

// PATCH /api/messages/:orderId/read — marks every message in this thread NOT sent by the
// caller as read ("I've seen the other party's messages").
export async function markThreadRead(req, res) {
  const { orderId } = req.params;
  const order = await fetchOrderOr404(orderId);
  assertParty(req, order);

  const { error } = await supabaseAdmin
    .from('messages')
    .update({ read: true })
    .eq('order_id', orderId)
    .neq('sender_id', req.profile.id)
    .eq('read', false);
  if (error) throw new ApiError(error.message, 400);
  res.status(204).end();
}
