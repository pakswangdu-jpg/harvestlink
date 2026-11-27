import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

const ordersById = new Map();
const eventsLog = [];
const notificationsLog = [];
let arrangeCounter = 0;

const wholesaleProduct = {
  id: 'prod-wholesale-1',
  farmer_id: 'farmer-1',
  name: 'Cabbage',
  category: 'Vegetables',
  grade: 'A',
  unit: 'kg',
  price: 50,
  quantity: 200,
  selling_type: 'wholesale',
  moq: 50,
  location: 'Dalaguete',
  status: 'active',
  expiration_date: null,
};

const retailProduct = {
  id: 'prod-retail-1',
  farmer_id: 'farmer-1',
  name: 'Carrots',
  category: 'Vegetables',
  grade: 'A',
  unit: 'kg',
  price: 60,
  quantity: 25,
  selling_type: 'retail',
  moq: null,
  location: 'Dalaguete',
  status: 'active',
  expiration_date: null,
};

function createBuilder(table) {
  let idFilter = null;
  let updatePayload = null;
  let insertPayload = null;
  let statusFilter = null;
  let deliveryStatusFilter = null;

  const chain = {
    select: () => chain,
    in: () => chain,
    order: () => chain,
    limit: () => chain,
    eq: (col, val) => {
      if (col === 'id') idFilter = val;
      if (col === 'status') statusFilter = val;
      if (col === 'delivery_status') deliveryStatusFilter = val;
      return chain;
    },
    insert: (row) => {
      insertPayload = row;
      if (table === 'order_delivery_events') {
        eventsLog.push({ id: `evt-${eventsLog.length + 1}`, occurred_at: new Date().toISOString(), ...row });
      }
      return chain;
    },
    update: (row) => { updatePayload = row; return chain; },
    single: async () => {
      if (table === 'products') {
        const found = idFilter === wholesaleProduct.id
          ? wholesaleProduct
          : idFilter === retailProduct.id
            ? retailProduct
            : null;
        return { data: found, error: null };
      }
      if (table === 'profiles') {
        return {
          data: {
            id: 'farmer-1',
            name: 'Farmer Juan',
            verification_status: 'verified',
            account_status: 'active',
            gcash_account_name: 'Farmer Juan',
            gcash_qr_url: 'https://example.com/qr.png',
          },
          error: null,
        };
      }
      if (table === 'orders') {
        const current = ordersById.get(idFilter);
        if (!current) return { data: null, error: null };
        if (updatePayload) {
          const updated = { ...current, ...updatePayload };
          ordersById.set(idFilter, updated);
          return { data: updated, error: null };
        }
        return { data: current, error: null };
      }
      return { data: insertPayload, error: null };
    },
    maybeSingle: async () => {
      if (table === 'orders') {
        const current = ordersById.get(idFilter);
        if (!current) return { data: null, error: null };
        if (updatePayload) {
          if (statusFilter && current.status !== statusFilter) return { data: null, error: null };
          if (deliveryStatusFilter && current.delivery_status !== deliveryStatusFilter) return { data: null, error: null };
          const updated = { ...current, ...updatePayload };
          ordersById.set(idFilter, updated);
          return { data: updated, error: null };
        }
        return { data: current, error: null };
      }
      return { data: null, error: null };
    },
    then: (resolve) => resolve({ data: insertPayload || [], error: null }),
  };
  return chain;
}

mock.module('../src/lib/supabaseClient.js', {
  namedExports: {
    supabaseAdmin: {
      from: createBuilder,
      rpc: async (name, params) => {
        if (name === 'create_marketplace_order') {
          const created = { id: 'order-ws-1', ...params.p_order };
          ordersById.set(created.id, created);
          return { data: created, error: null };
        }
        if (name === 'arrange_wholesale_delivery') {
          const current = ordersById.get(params.p_order);
          const subtotal = Math.round(Number(current.unit_price) * Number(current.quantity) * 100) / 100;
          const updated = {
            ...current,
            delivery_method: params.p_delivery_method,
            delivery_fee: params.p_delivery_fee,
            total_amount: Math.round((subtotal + params.p_delivery_fee) * 100) / 100,
            estimated_pickup_time: params.p_estimated_pickup_time,
            estimated_delivery_at: params.p_estimated_delivery_at,
            courier_booking_reference: params.p_booking_reference,
            delivery_instructions: params.p_delivery_instructions,
            delivery_arrangement_status: 'pending_buyer_confirmation',
            delivery_arranged_at: new Date(Date.now() + (++arrangeCounter) * 1000).toISOString(),
            buyer_confirmed_total_at: null,
            buyer_confirmed_total: null,
          };
          ordersById.set(current.id, updated);
          return { data: updated, error: null };
        }
        if (name === 'confirm_wholesale_delivery') {
          const current = ordersById.get(params.p_order);
          const updated = {
            ...current,
            delivery_arrangement_status: 'confirmed',
            buyer_confirmed_total_at: new Date().toISOString(),
            buyer_confirmed_total: current.total_amount,
          };
          ordersById.set(current.id, updated);
          return { data: updated, error: null };
        }
        if (name === 'transition_marketplace_order') {
          const current = ordersById.get(params.p_order);
          const updated = { ...current, status: params.p_action };
          ordersById.set(current.id, updated);
          return { data: updated, error: null };
        }
        if (name === 'complete_marketplace_order') {
          const current = ordersById.get(params.p_order);
          const updated = {
            ...current,
            status: 'completed',
            delivery_status: 'completed',
            payment_status: params.p_payment_status,
            completed_at: new Date().toISOString(),
          };
          ordersById.set(current.id, updated);
          return { data: updated, error: null };
        }
        return { data: null, error: null };
      },
    },
  },
});

mock.module('../src/lib/notify.js', {
  namedExports: {
    createNotification: async (payload) => {
      notificationsLog.push(payload);
      return payload;
    },
  },
});

mock.module('../src/lib/messageTraceability.js', {
  namedExports: {
    linkProductConversationToOrder: async () => {},
  },
});

const {
  createOrder,
  arrangeWholesaleDelivery,
  confirmWholesaleDelivery,
  updateOrderStatus,
  advanceWholesaleDelivery,
} = await import('../src/controllers/orders.controller.js');

const invoke = async (handler, req) => {
  let status = 200;
  let body = null;
  const res = {
    status(code) { status = code; return this; },
    json(data) { body = data; return this; },
    setHeader() {},
  };
  await handler(req, res);
  return { status, body };
};

test('end-to-end wholesale farmer-arranged delivery workflow with Lalamove, fee revision, GCash guard, and sequential statuses', async () => {
  const buyer = { id: 'buyer-1', role: 'buyer', name: 'Buyer Maria', municipality: 'Cebu City', address: '123 Colon St, Cebu City' };
  const farmer = { id: 'farmer-1', role: 'farmer', name: 'Farmer Juan' };

  // 1. Buyer places wholesale order (even if client passes courier, backend enforces farmer_arranged)
  const created = await invoke(createOrder, {
    profile: buyer,
    body: {
      productId: wholesaleProduct.id,
      quantity: 60,
      deliveryMethod: 'courier',
      deliveryAddress: '123 Colon St, Cebu City',
      paymentMethod: 'gcash',
      message: 'Please deliver in the morning.',
    },
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.sellingType, 'wholesale');
  assert.equal(created.body.deliveryMethod, 'farmer_arranged');
  assert.equal(created.body.deliveryArrangementStatus, 'pending_farmer');
  assert.equal(created.body.deliveryFee, 0);
  assert.equal(created.body.totalAmount, 3000);
  assert.equal(notificationsLog.at(-1).title, 'New wholesale order');
  assert.equal(notificationsLog.at(-1).userId, 'farmer-1');

  const orderId = created.body.id;

  // 2. Unauthorized buyer cannot arrange delivery
  await assert.rejects(
    invoke(arrangeWholesaleDelivery, {
      profile: buyer,
      params: { id: orderId },
      body: { deliveryMethod: 'courier', deliveryFee: 300 },
    }),
    { status: 403 },
  );

  // 3. Farmer submits Lalamove arrangement
  const arranged = await invoke(arrangeWholesaleDelivery, {
    profile: farmer,
    params: { id: orderId },
    body: {
      deliveryMethod: 'courier',
      deliveryFee: 350,
      estimatedPickupTime: 'Tomorrow 8:00 AM',
      estimatedDeliveryAt: '2026-11-29T02:00:00.000Z',
      bookingReference: 'LLM-CEBU-5512',
      deliveryInstructions: 'Call upon arrival at warehouse gate.',
    },
  });
  assert.equal(arranged.body.deliveryMethod, 'courier');
  assert.equal(arranged.body.deliveryFee, 350);
  assert.equal(arranged.body.totalAmount, 3350);
  assert.equal(arranged.body.deliveryArrangementStatus, 'pending_buyer_confirmation');
  assert.equal(notificationsLog.at(-1).title, 'Delivery arrangement submitted');
  assert.equal(notificationsLog.at(-1).userId, 'buyer-1');

  const firstArrangedAt = arranged.body.deliveryArrangedAt;

  // 4. Farmer revises fee -> stale buyer confirmation must fail with 409
  const revised = await invoke(arrangeWholesaleDelivery, {
    profile: farmer,
    params: { id: orderId },
    body: {
      deliveryMethod: 'courier',
      deliveryFee: 400,
      estimatedPickupTime: 'Tomorrow 8:30 AM',
      estimatedDeliveryAt: '2026-11-29T02:30:00.000Z',
      bookingReference: 'LLM-CEBU-5512',
    },
  });
  assert.equal(revised.body.totalAmount, 3400);
  await assert.rejects(
    invoke(confirmWholesaleDelivery, {
      profile: buyer,
      params: { id: orderId },
      body: { arrangedAt: firstArrangedAt },
    }),
    { status: 409 },
  );

  // 5. Buyer confirms revised total
  const buyerConfirmed = await invoke(confirmWholesaleDelivery, {
    profile: buyer,
    params: { id: orderId },
    body: { arrangedAt: revised.body.deliveryArrangedAt },
  });
  assert.equal(buyerConfirmed.body.deliveryArrangementStatus, 'confirmed');
  assert.equal(buyerConfirmed.body.buyerConfirmedTotal, 3400);
  assert.equal(notificationsLog.at(-1).title, 'Final order amount confirmed');
  assert.equal(notificationsLog.at(-1).userId, 'farmer-1');

  // 6. Farmer confirms order
  const orderConfirmed = await invoke(updateOrderStatus, {
    profile: farmer,
    params: { id: orderId },
    body: { status: 'confirmed' },
  });
  assert.equal(orderConfirmed.body.status, 'confirmed');
  assert.equal(orderConfirmed.body.deliveryStatus, 'pending'); // NOT automatically in_transit!

  // 7. GCash payment verification is required before dispatch
  await assert.rejects(
    invoke(advanceWholesaleDelivery, {
      profile: farmer,
      params: { id: orderId },
      body: { targetStatus: 'waiting_for_courier' },
    }),
    { status: 409 },
  );

  // Simulate GCash verified
  ordersById.set(orderId, { ...ordersById.get(orderId), payment_status: 'paid' });

  // 8. Cannot skip waiting_for_courier straight to in_transit
  await assert.rejects(
    invoke(advanceWholesaleDelivery, {
      profile: farmer,
      params: { id: orderId },
      body: { targetStatus: 'in_transit' },
    }),
    { status: 409 },
  );

  // 9. Sequential transitions: waiting_for_courier -> in_transit -> delivered -> buyer completed
  const waiting = await invoke(advanceWholesaleDelivery, {
    profile: farmer,
    params: { id: orderId },
    body: { targetStatus: 'waiting_for_courier' },
  });
  assert.equal(waiting.body.deliveryStatus, 'waiting_for_courier');
  assert.equal(notificationsLog.at(-1).title, 'Courier booking confirmed');

  const transit = await invoke(advanceWholesaleDelivery, {
    profile: farmer,
    params: { id: orderId },
    body: { targetStatus: 'in_transit' },
  });
  assert.equal(transit.body.deliveryStatus, 'in_transit');
  assert.equal(notificationsLog.at(-1).title, 'Order in transit');

  const delivered = await invoke(advanceWholesaleDelivery, {
    profile: farmer,
    params: { id: orderId },
    body: { targetStatus: 'delivered' },
  });
  assert.equal(delivered.body.deliveryStatus, 'delivered');
  assert.equal(notificationsLog.at(-1).title, 'Order delivered');

  // Farmer cannot mark completed; only buyer can confirm receipt
  await assert.rejects(
    invoke(advanceWholesaleDelivery, {
      profile: farmer,
      params: { id: orderId },
      body: { targetStatus: 'completed' },
    }),
    { status: 403 },
  );

  const completed = await invoke(advanceWholesaleDelivery, {
    profile: buyer,
    params: { id: orderId },
    body: { targetStatus: 'completed' },
  });
  assert.equal(completed.body.status, 'completed');
  assert.equal(completed.body.deliveryStatus, 'completed');
});

test('retail non-Lalamove orders are rejected by shared arrangement endpoint', async () => {
  ordersById.set('order-retail-1', {
    id: 'order-retail-1',
    farmer_id: 'farmer-1',
    buyer_id: 'buyer-1',
    selling_type: 'retail',
    status: 'pending',
    delivery_method: 'farmer_delivery',
  });

  await assert.rejects(
    invoke(arrangeWholesaleDelivery, {
      profile: { id: 'farmer-1', role: 'farmer' },
      params: { id: 'order-retail-1' },
      body: { deliveryMethod: 'courier', deliveryFee: 200 },
    }),
    { status: 400 },
  );
});

test('end-to-end Retail Lalamove workflow reuses create_marketplace_order, arrangement, fee revision, GCash guard, and 6-stage timeline', async () => {
  const buyer = { id: 'buyer-1', role: 'buyer', name: 'Buyer Maria', municipality: 'Cebu City', address: '45 Osmena Blvd, Cebu City' };
  const farmer = { id: 'farmer-1', role: 'farmer', name: 'Farmer Juan' };

  // 1. Retail buyer places Lalamove order -> uses create_marketplace_order (no missing create_lalamove_quote_order RPC)
  const created = await invoke(createOrder, {
    profile: buyer,
    body: {
      productId: retailProduct.id,
      quantity: 5,
      deliveryMethod: 'courier',
      deliveryAddress: '45 Osmena Blvd, Cebu City',
      paymentMethod: 'gcash',
      expectedTotal: 300,
    },
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.sellingType, 'retail');
  assert.equal(created.body.deliveryMethod, 'courier');
  assert.equal(created.body.deliveryArrangementStatus, 'pending_farmer');
  assert.equal(created.body.deliveryFee, 0);
  assert.equal(created.body.totalAmount, 300);
  assert.equal(notificationsLog.at(-1).title, 'New Lalamove order');

  const orderId = created.body.id;

  // 2. Farmer arranges Lalamove delivery without booking reference (optional until booked)
  const arranged = await invoke(arrangeWholesaleDelivery, {
    profile: farmer,
    params: { id: orderId },
    body: {
      deliveryMethod: 'courier',
      deliveryFee: 180,
      estimatedPickupTime: 'Today 3:00 PM - 4:00 PM',
      estimatedDeliveryAt: '2026-11-28T09:00:00.000Z',
      bookingReference: '',
    },
  });
  assert.equal(arranged.body.deliveryMethod, 'courier');
  assert.equal(arranged.body.deliveryFee, 180);
  assert.equal(arranged.body.totalAmount, 480);
  assert.equal(arranged.body.deliveryArrangementStatus, 'pending_buyer_confirmation');
  assert.equal(arranged.body.courierBookingReference, null);

  // 3. Buyer confirms final amount -> farmer confirms order
  const confirmedArrangement = await invoke(confirmWholesaleDelivery, {
    profile: buyer,
    params: { id: orderId },
    body: { arrangedAt: arranged.body.deliveryArrangedAt },
  });
  assert.equal(confirmedArrangement.body.deliveryArrangementStatus, 'confirmed');
  assert.equal(confirmedArrangement.body.buyerConfirmedTotal, 480);

  const confirmedOrder = await invoke(updateOrderStatus, {
    profile: farmer,
    params: { id: orderId },
    body: { status: 'confirmed' },
  });
  assert.equal(confirmedOrder.body.status, 'confirmed');

  // 4. GCash payment verification required before dispatch
  await assert.rejects(
    invoke(advanceWholesaleDelivery, {
      profile: farmer,
      params: { id: orderId },
      body: { targetStatus: 'waiting_for_courier' },
    }),
    { status: 409 },
  );

  // Mark GCash verified -> sequential 6-stage progression
  ordersById.set(orderId, { ...ordersById.get(orderId), payment_status: 'paid' });

  const waiting = await invoke(advanceWholesaleDelivery, {
    profile: farmer,
    params: { id: orderId },
    body: { targetStatus: 'waiting_for_courier' },
  });
  assert.equal(waiting.body.deliveryStatus, 'waiting_for_courier');

  // Cannot skip directly to delivered
  await assert.rejects(
    invoke(advanceWholesaleDelivery, {
      profile: farmer,
      params: { id: orderId },
      body: { targetStatus: 'delivered' },
    }),
    { status: 409 },
  );

  const inTransit = await invoke(advanceWholesaleDelivery, {
    profile: farmer,
    params: { id: orderId },
    body: { targetStatus: 'in_transit' },
  });
  assert.equal(inTransit.body.deliveryStatus, 'in_transit');

  const delivered = await invoke(advanceWholesaleDelivery, {
    profile: farmer,
    params: { id: orderId },
    body: { targetStatus: 'delivered' },
  });
  assert.equal(delivered.body.deliveryStatus, 'delivered');

  const completed = await invoke(advanceWholesaleDelivery, {
    profile: buyer,
    params: { id: orderId },
    body: { targetStatus: 'completed' },
  });
  assert.equal(completed.body.status, 'completed');
  assert.equal(completed.body.deliveryStatus, 'completed');
});
