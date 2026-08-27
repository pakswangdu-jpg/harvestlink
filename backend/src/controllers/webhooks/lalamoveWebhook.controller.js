import { supabaseAdmin } from '../../lib/supabaseClient.js';
import { LALAMOVE_STATUS_MAP, isForwardProgress } from '../../lib/lalamoveStatusMap.js';
import { createNotification } from '../../lib/notify.js';

// POST /api/webhooks/lalamove — signature already verified by verifyLalamoveWebhook
// (webhooks.routes.js) before this runs; nothing here trusts the caller beyond that. Lalamove's
// own ORDER_STATUS_CHANGED event shape: { eventId, eventType, data: { order: { orderId, status } } }.
//
// Always responds 200 once the payload has been read, even for events this function doesn't
// act on (wrong eventType, unrecognized order, no forward progress) — a non-200 tells
// Lalamove to retry, which is only correct for an actual failure to process, not "nothing to
// do here."
export async function handleLalamoveWebhook(req, res) {
  const { eventType, data } = req.body || {};

  // DRIVER_ASSIGNED — a separate event type from ORDER_STATUS_CHANGED (the ON_GOING status
  // change usually arrives alongside it, but driver details are only ever on this one).
  // NOTE: the exact field names here (data.driver.name/phone/plateNumber) are a best-effort
  // guess from common Lalamove driver-object conventions — Lalamove's public docs don't spell
  // out this payload precisely. Log the first real sandbox delivery and correct the field
  // names below if they don't match; DeliveryInfoCard.jsx already renders these fields only
  // when present, so a missed field just means "no driver info shown yet," not a crash.
  if (eventType === 'DRIVER_ASSIGNED') {
    const lalamoveOrderId = data?.order?.orderId;
    const driver = data?.driver;
    if (lalamoveOrderId && driver) {
      await supabaseAdmin.from('deliveries')
        .update({
          driver_name: driver.name || null,
          driver_phone: driver.phone || null,
          vehicle_type: driver.plateNumber ? `${driver.vehicleType || 'Motorcycle'} · Plate: ${driver.plateNumber}` : (driver.vehicleType || null),
        })
        .eq('lalamove_order_id', lalamoveOrderId);
    }
    res.status(200).json({ received: true });
    return;
  }

  const lalamoveOrderId = data?.order?.orderId;
  const lalamoveStatus = data?.order?.status;

  if (eventType !== 'ORDER_STATUS_CHANGED' || !lalamoveOrderId || !lalamoveStatus) {
    res.status(200).json({ received: true });
    return;
  }

  const mapped = LALAMOVE_STATUS_MAP[lalamoveStatus];
  if (!mapped) {
    console.warn(`Lalamove webhook: unrecognized status "${lalamoveStatus}" for order ${lalamoveOrderId}.`);
    res.status(200).json({ received: true });
    return;
  }

  const { data: delivery, error: deliveryError } = await supabaseAdmin
    .from('deliveries').select('*').eq('lalamove_order_id', lalamoveOrderId).maybeSingle();
  if (deliveryError || !delivery) {
    // Not one of ours (a different market's webhook hitting the same URL, a sandbox test
    // event with no matching order, etc.) — still 200 so Lalamove doesn't retry forever.
    res.status(200).json({ received: true });
    return;
  }

  // The out-of-order/duplicate-safety check (see lalamoveStatusMap.js) — a no-op is still 200.
  if (!isForwardProgress(delivery.delivery_status, mapped.deliveryStatus)) {
    res.status(200).json({ received: true });
    return;
  }

  await supabaseAdmin.from('deliveries').update({
    lalamove_status: lalamoveStatus,
    delivery_status: mapped.deliveryStatus,
  }).eq('id', delivery.id);

  const { data: order } = await supabaseAdmin
    .from('orders').select('*').eq('id', delivery.order_id).single();

  if (order) {
    const orderUpdate = { delivery_status: mapped.deliveryStatus };
    // Mirrors the buyer's own "Got it" completion in advanceDelivery (orders.controller.js) —
    // COD is only ever marked paid once the order is actually, verifiably complete.
    if (mapped.deliveryStatus === 'delivered') {
      orderUpdate.status = 'completed';
      if (order.payment_method === 'cod') orderUpdate.payment_status = 'paid';
    } else if (mapped.deliveryStatus === 'cancelled') {
      orderUpdate.status = 'cancelled';
    }
    await supabaseAdmin.from('orders').update(orderUpdate).eq('id', order.id);

    await createNotification({
      userId: order.buyer_id,
      type: 'order',
      title: mapped.title,
      message: mapped.description,
      link: `/orders/${order.id}`,
    });
  }

  await supabaseAdmin.from('order_delivery_events').insert({
    order_id: delivery.order_id,
    status: mapped.deliveryStatus,
    title: mapped.title,
    description: mapped.description,
    source: 'lalamove',
  });

  res.status(200).json({ received: true });
}
