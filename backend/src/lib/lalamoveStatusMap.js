




export const LALAMOVE_STATUS_MAP = {
  ASSIGNING_DRIVER: {
    deliveryStatus: 'assigning_driver',
    title: 'Looking for a driver',
    description: 'Looking for a delivery driver.',
  },
  ON_GOING: {
    deliveryStatus: 'driver_assigned',
    title: 'Driver assigned',
    description: 'A Lalamove driver has been assigned.',
  },
  PICKED_UP: {
    deliveryStatus: 'picked_up',
    title: 'Picked up',
    description: 'Your order has been picked up from the farmer.',
  },
  COMPLETED: {
    deliveryStatus: 'delivered',
    title: 'Delivered',
    description: 'Your order has been delivered.',
  },



  CANCELED: {
    deliveryStatus: 'cancelled',
    title: 'Delivery cancelled',
    description: 'This delivery was cancelled.',
  },
  REJECTED: {
    deliveryStatus: 'cancelled',
    title: 'Delivery cancelled',
    description: 'This delivery was cancelled.',
  },
  EXPIRED: {
    deliveryStatus: 'cancelled',
    title: 'Delivery cancelled',
    description: 'This delivery was cancelled.',
  },
};





const STATUS_RANK = ['assigning_driver', 'driver_assigned', 'picked_up', 'delivered'];

export function isForwardProgress(currentDeliveryStatus, nextDeliveryStatus) {
  if (nextDeliveryStatus === 'cancelled') return currentDeliveryStatus !== 'delivered';
  const currentRank = STATUS_RANK.indexOf(currentDeliveryStatus);
  const nextRank = STATUS_RANK.indexOf(nextDeliveryStatus);
  if (nextRank === -1) return false;
  return nextRank > currentRank;
}
