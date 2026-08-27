import { supabaseAdmin } from '../lib/supabaseClient.js';
import { getQuotation, createOrder } from '../lib/lalamoveClient.js';
import { LALAMOVE_STATUS_MAP } from '../lib/lalamoveStatusMap.js';
import { getMunicipalityCoords, CEBU_MUNICIPALITIES } from '../utils/constants.js';
import { matchMunicipality } from '../lib/geo.js';
import { ApiError } from '../lib/ApiError.js';

// POST /api/lalamove/quote — checkout-time preview only (mirrors deliveryFee.controller.js's
// getDeliveryFeeEstimate, which farmer_delivery/buyer_pickup keep using unchanged — this is
// the courier-specific equivalent, backed by a real Lalamove quotation instead of the
// road-distance fee formula). Never trusted for what actually gets charged: the fee shown
// here is re-quoted from scratch when the farmer confirms the order (see
// createLalamoveDeliveryForOrder below), exactly like every other delivery-fee preview in
// this app is independently recomputed server-side at order creation.
export async function getLalamoveQuote(req, res) {
  const { productId, deliveryMunicipality } = req.body;
  if (!productId) throw new ApiError('productId is required.', 400);
  if (!CEBU_MUNICIPALITIES.includes(deliveryMunicipality)) throw new ApiError('A valid deliveryMunicipality is required.', 400);

  const { data: product, error: productError } = await supabaseAdmin
    .from('products').select('farmer_id, location, name').eq('id', productId).single();
  if (productError || !product) throw new ApiError('Product was not found.', 404);

  const originMunicipality = matchMunicipality(product.location);
  const pickupCoords = getMunicipalityCoords(originMunicipality);
  const dropoffCoords = getMunicipalityCoords(deliveryMunicipality);

  try {
    const quotation = await getQuotation({
      pickup: { ...pickupCoords, address: product.location || originMunicipality },
      dropoff: { ...dropoffCoords, address: deliveryMunicipality },
    });
    res.json({
      fee: quotation.fee,
      distanceKm: quotation.distanceKm,
      durationMinutes: quotation.durationMinutes,
      quotationId: quotation.quotationId,
      expiresAt: quotation.expiresAt,
    });
  } catch (error) {
    // Never a fabricated fee — the frontend shows "Delivery quotation unavailable. Please try
    // again." for this exact status (see lalamoveService.js / CheckoutForm.jsx).
    throw new ApiError(error.message || 'Delivery quotation unavailable.', 502);
  }
}

// Called from updateOrderStatus (orders.controller.js) the moment the farmer confirms a
// courier-method order — the same trigger point that already sent a "Courier assigned"
// notification before this integration existed. Re-quotes from scratch rather than reusing
// whatever quotationId the buyer saw at checkout: Lalamove quotations expire after 5 minutes,
// and a farmer can take far longer than that to confirm an order.
//
// Never throws in a way that blocks the order confirmation itself — a failed Lalamove booking
// still leaves a confirmed order, just without lalamove_order_id set, so the farmer's existing
// manual "Book with Lalamove" fallback (LinkLalamoveDeliveryDialog.jsx) remains available.
export async function createLalamoveDeliveryForOrder(order) {
  try {
    const { data: farmer } = await supabaseAdmin
      .from('profiles').select('name, contact_number').eq('id', order.farmer_id).single();
    const { data: buyer } = await supabaseAdmin
      .from('profiles').select('name, contact_number').eq('id', order.buyer_id).single();

    const pickupCoords = getMunicipalityCoords(order.origin_municipality);
    const dropoffCoords = getMunicipalityCoords(order.delivery_municipality);

    const quotation = await getQuotation({
      pickup: { ...pickupCoords, address: order.origin_municipality },
      dropoff: { ...dropoffCoords, address: order.delivery_municipality },
    });

    const created = await createOrder({
      quotation,
      sender: { name: farmer?.name || order.farmer_name, phone: farmer?.contact_number },
      recipient: { name: buyer?.name || order.buyer_name, phone: buyer?.contact_number },
    });

    const mapped = LALAMOVE_STATUS_MAP[created.status] || LALAMOVE_STATUS_MAP.ASSIGNING_DRIVER;

    await supabaseAdmin.from('deliveries').upsert({
      order_id: order.id,
      courier_company: 'Lalamove',
      lalamove_order_id: created.lalamoveOrderId,
      lalamove_quotation_id: quotation.quotationId,
      lalamove_status: created.status,
      delivery_status: mapped.deliveryStatus,
      // Lalamove's own real tracking page for this order — same "Track Delivery" link the
      // manual-entry fallback already opens (see DeliveryInfoCard.jsx), just populated
      // automatically instead of the farmer copying it in by hand.
      tracking_url: created.trackingUrl,
    }, { onConflict: 'order_id' });

    await supabaseAdmin.from('order_delivery_events').insert({
      order_id: order.id,
      status: mapped.deliveryStatus,
      title: mapped.title,
      description: mapped.description,
      source: 'lalamove',
    });

    return { booked: true };
  } catch (error) {
    console.error(`Lalamove booking failed for order ${order.id}:`, error.message);
    return { booked: false, error: error.message };
  }
}
