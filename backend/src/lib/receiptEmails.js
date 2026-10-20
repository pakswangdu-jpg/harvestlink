import { supabaseAdmin } from './supabaseClient.js';
import { createFinalReceiptMessage, sendFinalReceiptEmail } from './email.js';
import { loadOrderReceipt } from './orderReceipt.js';
import { isFinalReceiptReady } from '../../shared/receipt.js';
import { serializeOrder } from './serialize.js';

export async function processReceiptEmails({ db = supabaseAdmin, send = sendFinalReceiptEmail, load = loadOrderReceipt, logger = console } = {}) {
  const { data: jobs, error } = await db.rpc('claim_final_receipt_emails', { p_limit: 10 });
  if (error) throw new Error('Receipt email queue unavailable. Apply the final-transaction-receipts migration.');
  for (const job of jobs || []) {
    const save = async patch => {
      const result = await db.from('order_receipt_emails').update(patch)
        .eq('order_id', job.order_id).eq('claim_token', job.claim_token).eq('status', 'sending').select('order_id').maybeSingle();
      if (result.error || !result.data) throw new Error('Receipt email claim could not be saved.');
    };
    try {
      const { data: order, error: orderError } = await db.from('orders').select('*').eq('id', job.order_id).single();
      if (orderError || !order) throw new Error('Receipt order unavailable.');
      if (!isFinalReceiptReady(serializeOrder(order))) {
        await save({ status: 'skipped', last_error: 'transaction_not_final', locked_until: null });
        continue;
      }
      let payload = job.payload;
      if (!payload) {
        const receipt = await load(order, { includeBuyerEmail: true });
        payload = createFinalReceiptMessage(receipt, receipt.buyer.email);
        // Freeze recipient, contents and sender before the first provider request.
        await save({ payload });
      }
      if (job.first_attempt_at && Date.now() - new Date(job.first_attempt_at).getTime() >= 23 * 3600000) {
        throw new Error('The receipt retry window has expired.');
      }
      await save({ locked_until: new Date(Date.now() + 300000).toISOString() });
      const sent = await send(payload, `final-receipt/${job.order_id}`);
      if (!sent?.id) throw new Error('The email provider did not acknowledge this receipt.');
      await save({ status: 'sent', sent_at: new Date().toISOString(), provider_message_id: sent.id, last_error: null, locked_until: null });
    } catch {
      try {
        await save({ status: 'failed', last_error: 'email_send_failed', locked_until: null,
          next_attempt_at: new Date(Date.now() + Math.min(3600000, 60000 * (2 ** Math.min(job.attempts, 6)))).toISOString() });
      } catch { /* The durable lease makes a lost acknowledgement retryable. */ }
      logger.error('Final receipt email pending retry.');
    }
  }
}

export function startReceiptEmailJob({ run = processReceiptEmails, intervalMs = 15000, logger = console } = {}) {
  let running = false;
  let stopped = false;
  const tick = async () => {
    if (running || stopped) return;
    running = true;
    try { await run(); } catch (error) { logger.error(error.message); } finally { running = false; }
  };
  const timer = setInterval(() => { void tick(); }, intervalMs);
  timer.unref?.();
  void tick();
  return () => { stopped = true; clearInterval(timer); };
}
