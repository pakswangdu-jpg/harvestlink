import { supabaseAdmin } from './supabaseClient.js';
import { serializeOrder } from './serialize.js';
import { buildReceipt } from '../../shared/receipt.js';

export async function loadOrderReceipt(order, { includeBuyerEmail = false } = {}) {
  let email = null;
  let completedAt = order.completed_at;
  if (includeBuyerEmail) {
    const { data, error } = await supabaseAdmin.from('profiles').select('email').eq('id', order.buyer_id).single();
    if (error || !data?.email) throw new Error('The registered receipt email is unavailable.');
    email = data.email;
  }
  if (!completedAt && order.status === 'completed') {
    const { data, error } = await supabaseAdmin.from('order_delivery_events').select('occurred_at')
      .eq('order_id', order.id).eq('status', order.delivery_method === 'buyer_pickup' ? 'picked_up' : 'delivered')
      .order('occurred_at', { ascending: true }).limit(1).maybeSingle();
    if (error) throw new Error('The receipt completion history is unavailable.');
    completedAt = data?.occurred_at || null;
  }
  let delivery = null;
  if (order.delivery_method === 'courier') {
    const result = await supabaseAdmin.from('deliveries').select('courier_company,booking_reference').eq('order_id', order.id).maybeSingle();
    if (result.error) throw new Error('The receipt delivery details are unavailable.');
    delivery = result.data;
  }
  return buildReceipt(serializeOrder(order), { buyerEmail: email, completedAt, delivery });
}
