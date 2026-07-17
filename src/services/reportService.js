const PAID_STATUS = 'paid';
const ORDER_STATUSES = ['pending', 'confirmed', 'completed', 'rejected', 'cancelled'];
const DONATION_STATUSES = ['available', 'requested', 'scheduled', 'completed', 'cancelled'];
const USER_ROLES = ['farmer', 'buyer', 'stakeholder'];

export function getTotalRevenue(orders) {
  return orders
    .filter((order) => order.paymentStatus === PAID_STATUS)
    .reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
}

// Profit only sums orders whose product had a recorded cost at checkout time
// (order.unitCostPrice — see backend's createOrder, which snapshots products.cost_price).
// An order with no recorded cost is excluded entirely rather than assumed to be 100% profit
// — see getProfitCoverage for how to tell a caller whether that's most/all orders or just a
// few, since a farmer who's never filled in "cost per unit" would otherwise see a profit
// figure that's really just their income restated, silently overstating margin.
export function getTotalProfit(orders) {
  return orders
    .filter((order) => order.paymentStatus === PAID_STATUS && order.unitCostPrice != null)
    .reduce((sum, order) => sum + (Number(order.unitPrice) - Number(order.unitCostPrice)) * Number(order.quantity), 0);
}

// { covered, total } — how many paid orders actually fed into getTotalProfit, out of how
// many paid orders exist overall. Lets the UI caveat the profit figure when it's based on
// only some of a farmer's sales (e.g. "based on 3 of 5 paid orders").
export function getProfitCoverage(orders) {
  const paidOrders = orders.filter((order) => order.paymentStatus === PAID_STATUS);
  const covered = paidOrders.filter((order) => order.unitCostPrice != null).length;
  return { covered, total: paidOrders.length };
}

// Last `monthsBack` calendar months (oldest first, current month included) — each
// point sums paid-order revenue for orders actually created in that month.
export function getMonthlyRevenue(orders, monthsBack = 6) {
  const now = new Date();
  const months = [];
  for (let i = monthsBack - 1; i >= 0; i -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ year: date.getFullYear(), month: date.getMonth(), label: date.toLocaleDateString('en-PH', { month: 'short' }) });
  }

  const paidOrders = orders.filter((order) => order.paymentStatus === PAID_STATUS);

  return months.map(({ year, month, label }) => ({
    label,
    revenue: paidOrders
      .filter((order) => {
        const created = new Date(order.createdAt);
        return created.getFullYear() === year && created.getMonth() === month;
      })
      .reduce((sum, order) => sum + Number(order.totalAmount || 0), 0),
  }));
}

export function getOrderStatusBreakdown(orders) {
  return ORDER_STATUSES
    .map((status) => ({ status, count: orders.filter((order) => order.status === status).length }))
    .filter((entry) => entry.count > 0);
}

export function getDonationStatusBreakdown(donations) {
  return DONATION_STATUSES
    .map((status) => ({ status, count: donations.filter((donation) => donation.status === status).length }))
    .filter((entry) => entry.count > 0);
}

export function getUserRoleBreakdown(users) {
  return USER_ROLES.map((role) => ({ role, count: users.filter((user) => user.role === role).length }));
}

// Ranks products by revenue from paid orders — keyed by productId (not name), since two
// different farmers could otherwise coincidentally list identically-named produce.
export function getTopProducts(orders, limit = 5) {
  const byProduct = new Map();

  orders
    .filter((order) => order.paymentStatus === PAID_STATUS)
    .forEach((order) => {
      const existing = byProduct.get(order.productId) || {
        productId: order.productId,
        productName: order.productName,
        farmerName: order.farmerName,
        unit: order.unit,
        unitsSold: 0,
        revenue: 0,
      };
      existing.unitsSold += Number(order.quantity || 0);
      existing.revenue += Number(order.totalAmount || 0);
      byProduct.set(order.productId, existing);
    });

  return [...byProduct.values()].sort((a, b) => b.revenue - a.revenue).slice(0, limit);
}
