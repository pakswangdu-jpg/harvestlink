export const TO_RECEIVE_STAGES = ['preparing', 'ready_for_pickup', 'out_for_delivery', 'delivered'];

export function getBuyerOrderCounts(orders, getStage) {
  const stages = { all: orders.length };
  for (const order of orders) {
    const stage = getStage(order);
    stages[stage] = (stages[stage] || 0) + 1;
  }
  return {
    stages,
    summary: {
      total: stages.all,
      pending: stages.pending || 0,
      toReceive: TO_RECEIVE_STAGES.reduce((total, stage) => total + (stages[stage] || 0), 0),
      completed: stages.completed || 0,
      cancelled: (stages.cancelled || 0) + (stages.rejected || 0),
    },
  };
}
