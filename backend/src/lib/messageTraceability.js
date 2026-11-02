import { supabaseAdmin } from './supabaseClient.js';

// A direct inquiry is created before checkout, so it cannot use messages.order_id
// (that column is reserved for order-scoped messages). Link the latest matching
// product-context message after the atomic order is created instead. This is a
// best-effort metadata write: it must never turn a successful checkout into a
// failed order if an older database has not received the traceability migration.
export async function linkProductConversationToOrder(order) {
  const productId = order?.product_id_snapshot || order?.product_id;
  if (!order?.id || !productId || !order.buyer_id || !order.farmer_id) return;

  try {
    const { data: contextMessage, error: lookupError } = await supabaseAdmin
      .from('messages')
      .select('id')
      .eq('context_product_id', productId)
      .eq('sender_id', order.buyer_id)
      .eq('recipient_id', order.farmer_id)
      .is('context_order_id', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lookupError) {
      console.warn('Unable to find product inquiry for order traceability:', lookupError.message);
      return;
    }
    if (!contextMessage?.id) return;

    const { error: updateError } = await supabaseAdmin
      .from('messages')
      .update({ context_order_id: order.id })
      .eq('id', contextMessage.id)
      .is('context_order_id', null);
    if (updateError) {
      console.warn('Unable to link product inquiry to order:', updateError.message);
    }
  } catch (error) {
    console.warn('Unable to link product inquiry to order; checkout remains successful:', error.message);
  }
}
