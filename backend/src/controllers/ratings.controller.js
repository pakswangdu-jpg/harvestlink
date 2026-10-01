import { supabaseAdmin } from '../lib/supabaseClient.js';
import { serializeRating } from '../lib/serialize.js';
import { ApiError } from '../lib/ApiError.js';





export async function listRatings(req, res) {
  const { farmerId, orderId } = req.query;
  if (!farmerId && !orderId) throw new ApiError('farmerId or orderId is required.', 400);

  let query = supabaseAdmin.from('ratings').select('*').order('created_at', { ascending: false });
  if (farmerId) query = query.eq('farmer_id', farmerId);
  if (orderId) query = query.eq('order_id', orderId);

  const { data, error } = await query;
  if (error) throw new ApiError(error.message, 400);
  res.json(data.map(serializeRating));
}







export async function createRating(req, res) {
  const { farmerId, orderId, comment } = req.body;
  const rating = Number(req.body.rating);

  if (!farmerId) throw new ApiError('farmerId is required.', 400);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new ApiError('Rating must be a whole number from 1 to 5.', 400);

  const { data: farmer, error: farmerError } = await supabaseAdmin
    .from('profiles')
    .select('id, role')
    .eq('id', farmerId)
    .single();
  if (farmerError || !farmer || farmer.role !== 'farmer') throw new ApiError('Farmer was not found.', 404);
  if (farmerId === req.profile.id) throw new ApiError('You cannot rate yourself.', 400);

  if (orderId) {
    if (req.profile.role !== 'buyer' && req.profile.role !== 'stakeholder') {
      throw new ApiError('Only buyers can rate an order.', 403);
    }
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('id, buyer_id, farmer_id, status')
      .eq('id', orderId)
      .single();
    if (orderError || !order) throw new ApiError('Order was not found.', 404);
    if (order.buyer_id !== req.profile.id) throw new ApiError('You do not have permission to rate this order.', 403);
    if (order.farmer_id !== farmerId) throw new ApiError('This order was not placed with that farmer.', 400);
    if (order.status !== 'completed') throw new ApiError('You can only rate an order once it is completed.', 400);

    const { data: existing } = await supabaseAdmin.from('ratings').select('id').eq('order_id', orderId).maybeSingle();
    if (existing) throw new ApiError('You already rated this order.', 409);
  } else if (req.profile.role !== 'stakeholder') {
    throw new ApiError('A rating must be tied to a completed order, or be from a stakeholder confirming a donation.', 400);
  }

  const row = {
    farmer_id: farmerId,
    rater_id: req.profile.id,
    rater_role: req.profile.role,
    order_id: orderId || null,
    rating,
    comment: comment?.trim() || null,
  };
  const { data, error } = await supabaseAdmin.from('ratings').insert(row).select().single();
  if (error) {
    if (error.code === '23505') throw new ApiError('You already rated this order.', 409);
    throw new ApiError(error.message, 400);
  }
  res.status(201).json(serializeRating(data));
}
