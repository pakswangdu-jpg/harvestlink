import { supabaseAdmin } from '../../lib/supabaseClient.js';
import { LALAMOVE_STATUS_MAP, isForwardProgress } from '../../lib/lalamoveStatusMap.js';
import { createNotification } from '../../lib/notify.js';









export async function handleLalamoveWebhook(req, res) {
  const { eventType, data } = req.body || {};








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


    res.status(200).json({ received: true });
    return;
  }


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
