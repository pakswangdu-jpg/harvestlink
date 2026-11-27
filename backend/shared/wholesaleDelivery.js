export const WHOLESALE_DELIVERY_METHOD = 'farmer_arranged';
export const WHOLESALE_ARRANGED_METHODS = ['farmer_delivery', 'courier', 'buyer_pickup'];

export const WHOLESALE_ARRANGEMENT_STATUS = {
  PENDING_FARMER: 'pending_farmer',
  PENDING_BUYER: 'pending_buyer_confirmation',
  CONFIRMED: 'confirmed',
};

export const WHOLESALE_DELIVERY_DESCRIPTION = 'The farmer will determine the most suitable delivery method based on your order quantity and location. Delivery fees and estimated arrival details will be provided after order placement.';
export const RETAIL_LALAMOVE_DESCRIPTION = 'The farmer will arrange your Lalamove delivery and provide the delivery fee and estimated arrival time for your confirmation.';
export const WHOLESALE_DELIVERY_FEE_PENDING_TEXT = 'Pending farmer confirmation.';
export const WHOLESALE_ORDER_PLACED_TITLE = 'Order Placed Successfully';
export const WHOLESALE_ORDER_PLACED_MESSAGE = 'Your wholesale order has been submitted. Please wait for the farmer to confirm the delivery arrangements.';
export const RETAIL_LALAMOVE_ORDER_PLACED_MESSAGE = 'Your Lalamove order has been submitted. Please wait for the farmer to provide the delivery fee and estimated arrival time for your confirmation.';

export const WHOLESALE_DELIVERY_METHOD_LABELS = {
  farmer_arranged: 'Farmer-Arranged Delivery',
  farmer_delivery: 'Farmer Delivery',
  courier: 'Lalamove',
  buyer_pickup: 'Buyer Pickup (Subject to Buyer Agreement)',
};

export function isWholesaleOrder(order) {
  return order?.sellingType === 'wholesale' || order?.selling_type === 'wholesale';
}

export function isRetailLalamoveOrder(order) {
  if (!order || isWholesaleOrder(order)) return false;
  const method = order.deliveryMethod ?? order.delivery_method;
  return method === 'courier';
}

export function usesSharedArrangedDelivery(order) {
  return isWholesaleOrder(order) || isRetailLalamoveOrder(order);
}

export function getWholesaleDeliverySequence(deliveryMethod) {
  if (deliveryMethod === 'courier') {
    return ['pending', 'waiting_for_courier', 'in_transit', 'delivered', 'completed'];
  }
  if (deliveryMethod === 'buyer_pickup') {
    return ['pending', 'ready_for_pickup', 'completed'];
  }
  if (deliveryMethod === 'farmer_delivery') {
    return ['pending', 'preparing', 'in_transit', 'delivered', 'completed'];
  }
  return ['pending'];
}

export function getWholesaleNextDeliveryStatus(order) {
  if (!usesSharedArrangedDelivery(order) || order.status !== 'confirmed') return null;
  const method = order.deliveryMethod ?? order.delivery_method;
  const current = order.deliveryStatus ?? order.delivery_status;
  const sequence = getWholesaleDeliverySequence(method);
  const index = sequence.indexOf(current);
  if (index === -1 || index >= sequence.length - 1) return null;
  return sequence[index + 1];
}

export function getWholesaleTimelineSteps(deliveryMethod) {
  if (deliveryMethod === 'courier') {
    return [
      {
        key: 'order_placed',
        eventStatuses: ['pending', 'order_placed'],
        title: 'Order Placed',
        description: 'Your wholesale order has been successfully submitted.',
      },
      {
        key: 'order_confirmed',
        eventStatuses: ['confirmed', 'order_confirmed'],
        title: 'Order Confirmed',
        description: 'The farmer has confirmed your order and delivery arrangements.',
      },
      {
        key: 'waiting_for_courier',
        eventStatuses: ['waiting_for_courier', 'packed'],
        title: 'Waiting for Courier',
        description: 'The delivery has been booked and is awaiting courier pickup.',
      },
      {
        key: 'in_transit',
        eventStatuses: ['in_transit', 'out_for_delivery'],
        title: 'In Transit',
        description: 'Your order has been collected and is on its way to your delivery address.',
      },
      {
        key: 'order_delivered',
        eventStatuses: ['delivered', 'order_delivered'],
        title: 'Order Delivered',
        description: 'Your order has been delivered. Please confirm receipt of your products.',
      },
      {
        key: 'order_completed',
        eventStatuses: ['completed', 'order_completed'],
        title: 'Order Completed',
        description: 'You have successfully confirmed receipt of your order.',
      },
    ];
  }

  if (deliveryMethod === 'buyer_pickup') {
    return [
      {
        key: 'order_placed',
        eventStatuses: ['pending', 'order_placed'],
        title: 'Order Placed',
        description: 'Your wholesale order has been successfully submitted.',
      },
      {
        key: 'order_confirmed',
        eventStatuses: ['confirmed', 'order_confirmed'],
        title: 'Order Confirmed',
        description: 'The farmer has confirmed your order and pickup arrangements.',
      },
      {
        key: 'ready_for_pickup',
        eventStatuses: ['ready_for_pickup'],
        title: 'Ready for Pickup',
        description: 'Your wholesale order is ready for collection at the agreed pickup location.',
      },
      {
        key: 'order_completed',
        eventStatuses: ['completed', 'picked_up', 'order_completed'],
        title: 'Order Completed',
        description: 'You have successfully confirmed receipt of your order.',
      },
    ];
  }

  return [
    {
      key: 'order_placed',
      eventStatuses: ['pending', 'order_placed'],
      title: 'Order Placed',
      description: 'Your wholesale order has been successfully submitted.',
    },
    {
      key: 'order_confirmed',
      eventStatuses: ['confirmed', 'order_confirmed'],
      title: 'Order Confirmed',
      description: 'The farmer has confirmed your order and delivery arrangements.',
    },
    {
      key: 'preparing',
      eventStatuses: ['preparing'],
      title: 'Preparing Order',
      description: 'The farmer is preparing your wholesale order for delivery.',
    },
    {
      key: 'in_transit',
      eventStatuses: ['in_transit', 'out_for_delivery'],
      title: 'Out for Delivery',
      description: 'Your order is on its way to your delivery address.',
    },
    {
      key: 'order_delivered',
      eventStatuses: ['delivered', 'order_delivered'],
      title: 'Order Delivered',
      description: 'Your order has been delivered. Please confirm receipt of your products.',
    },
    {
      key: 'order_completed',
      eventStatuses: ['completed', 'order_completed'],
      title: 'Order Completed',
      description: 'You have successfully confirmed receipt of your order.',
    },
  ];
}

export function buildWholesaleTimeline(order) {
  const method = order.deliveryMethod ?? order.delivery_method;
  const status = order.status;
  const deliveryStatus = order.deliveryStatus ?? order.delivery_status;
  const events = Array.isArray(order.deliveryEvents) ? order.deliveryEvents : [];
  const steps = getWholesaleTimelineSteps(method);

  const eventTimestamp = (eventStatuses) => {
    const match = [...events].reverse().find((event) => eventStatuses.includes(event.status));
    return match?.occurredAt || match?.occurred_at || null;
  };

  let reachedIndex = 0; // order_placed is always reached once order exists
  if (status === 'completed') {
    reachedIndex = steps.length - 1;
  } else if (status === 'confirmed') {
    reachedIndex = 1; // order_confirmed
    const deliveryIndex = steps.findIndex((step, index) => index >= 2 && step.eventStatuses.includes(deliveryStatus));
    if (deliveryIndex !== -1) reachedIndex = deliveryIndex;
  }

  return steps.map((step, index) => {
    let occurredAt = eventTimestamp(step.eventStatuses);
    if (!occurredAt && step.key === 'order_placed') {
      occurredAt = order.createdAt ?? order.created_at ?? null;
    }
    if (!occurredAt && step.key === 'order_completed' && status === 'completed') {
      occurredAt = order.completedAt ?? order.completed_at ?? order.updatedAt ?? order.updated_at ?? null;
    }

    const isCompleted = index <= reachedIndex;
    const isCurrent = status !== 'completed' && index === reachedIndex;
    return {
      key: step.key,
      title: step.title,
      description: step.description,
      state: isCompleted ? (isCurrent ? 'current' : 'completed') : 'pending',
      occurredAt: isCompleted ? occurredAt : null,
    };
  });
}

export function validateWholesaleArrangementInput(values) {
  const errors = {};
  const method = values?.deliveryMethod;
  if (!WHOLESALE_ARRANGED_METHODS.includes(method)) {
    errors.deliveryMethod = 'Select a valid delivery method.';
  }

  const feeNumber = values?.deliveryFee === '' || values?.deliveryFee === null || values?.deliveryFee === undefined
    ? NaN
    : Number(values.deliveryFee);
  if (!Number.isFinite(feeNumber) || feeNumber < 0 || Number(feeNumber.toFixed(2)) !== feeNumber) {
    errors.deliveryFee = 'Enter a valid delivery fee (0 or higher, up to 2 decimal places).';
  }

  if (method === 'courier') {
    if (!String(values?.estimatedPickupTime || '').trim()) {
      errors.estimatedPickupTime = 'Enter the estimated pickup time.';
    }
    if (!String(values?.estimatedDeliveryAt || '').trim() || Number.isNaN(Date.parse(values.estimatedDeliveryAt))) {
      errors.estimatedDeliveryAt = 'Enter a valid estimated delivery date and time.';
    }
    const bookingRef = String(values?.bookingReference || '').trim();
    if (bookingRef && bookingRef.length > 80) {
      errors.bookingReference = 'Booking reference must be 80 characters or fewer.';
    }
  } else if (values?.estimatedDeliveryAt && Number.isNaN(Date.parse(values.estimatedDeliveryAt))) {
    errors.estimatedDeliveryAt = 'Enter a valid estimated delivery date and time.';
  }

  const plate = String(values?.vehiclePlateNumber || '').trim();
  if (method !== 'buyer_pickup' && plate && (plate.length > 15 || !/^[A-Za-z0-9 -]+$/.test(plate))) {
    errors.vehiclePlateNumber = 'Enter a valid plate number (up to 15 letters, numbers, spaces, or hyphens).';
  }

  return errors;
}
