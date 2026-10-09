export const DELIVERY_SEQUENCES = {
  farmer_delivery: ['pending', 'preparing', 'packed', 'out_for_delivery', 'delivered'],
  courier: ['pending', 'preparing', 'packed', 'out_for_delivery', 'delivered'],
  buyer_pickup: ['pending', 'preparing', 'ready_for_pickup', 'picked_up'],
};

export const DELIVERY_STEP_LABELS = {
  pending: 'Order confirmed', preparing: 'Preparing', packed: 'Packed',
  ready_for_pickup: 'Ready for pickup', out_for_delivery: 'Out for delivery',
  picked_up: 'Picked up', delivered: 'Delivered', cancelled: 'Cancelled',
};
