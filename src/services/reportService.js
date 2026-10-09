const PAID_STATUS = 'paid';
const ORDER_STATUSES = ['pending', 'confirmed', 'completed', 'rejected', 'cancelled'];
const DONATION_STATUSES = ['available', 'requested', 'scheduled', 'completed', 'cancelled'];
const USER_ROLES = ['farmer', 'buyer', 'stakeholder'];

export const REPORT_PERIODS = [['7d', '7 days'], ['30d', '30 days'], ['6m', 'Last 6 months'], ['1y', '1 year'], ['all', 'All time']];
const MANILA_OFFSET = 8 * 60 * 60 * 1000;
const manilaDate = (value) => new Date(new Date(value).getTime() + MANILA_OFFSET);
const dateKey = (date) => date.toISOString().slice(0, 10);

export function getReportPeriodStart(period, now = new Date()) {
  const local = manilaDate(now);
  if (period === 'all') return null;
  if (period === '7d' || period === '30d') {
    local.setUTCHours(0, 0, 0, 0);
    local.setUTCDate(local.getUTCDate() - (period === '7d' ? 6 : 29));
  } else {
    local.setUTCDate(1); local.setUTCHours(0, 0, 0, 0);
    local.setUTCMonth(local.getUTCMonth() - (period === '1y' ? 11 : 5));
  }
  return new Date(local.getTime() - MANILA_OFFSET);
}

export function filterReportRecords(records, period, now = new Date()) {
  if (period === 'all') return records;
  const start = getReportPeriodStart(period, now).getTime();
  return records.filter((record) => { const date = Date.parse(record.createdAt); return date >= start && date <= now.getTime(); });
}

export function getReportRevenue(orders, period, now = new Date()) {
  const paid = filterReportRecords(orders, period, now).filter((order) => order.paymentStatus === PAID_STATUS && Number.isFinite(Date.parse(order.createdAt)));
  const daily = period === '7d' || period === '30d';
  let start = getReportPeriodStart(period, now);
  if (!start) {
    if (!paid.length) return [];
    start = new Date(paid.reduce((first, order) => Math.min(first, Date.parse(order.createdAt)), Infinity));
  }
  const cursor = manilaDate(start);
  cursor.setUTCHours(0, 0, 0, 0);
  if (!daily) cursor.setUTCDate(1);
  const end = manilaDate(now);
  const totals = new Map();
  for (const order of paid) {
    const key = dateKey(manilaDate(order.createdAt)).slice(0, daily ? 10 : 7);
    totals.set(key, (totals.get(key) || 0) + Number(order.totalAmount || 0));
  }
  const points = [];
  while (cursor <= end) {
    const key = dateKey(cursor).slice(0, daily ? 10 : 7);
    points.push({
      label: cursor.toLocaleDateString('en-PH', { timeZone: 'UTC', month: 'short', ...(daily ? { day: 'numeric' } : {}) }),
      fullLabel: cursor.toLocaleDateString('en-PH', { timeZone: 'UTC', month: 'short', year: 'numeric', ...(daily ? { day: 'numeric' } : {}) }),
      revenue: totals.get(key) || 0,
    });
    if (daily) cursor.setUTCDate(cursor.getUTCDate() + 1);
    else cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return points;
}

export function getTotalRevenue(orders) {
  return orders
    .filter((order) => order.paymentStatus === PAID_STATUS)
    .reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
}






export function getTotalProfit(orders) {
  return orders
    .filter((order) => order.paymentStatus === PAID_STATUS && order.unitCostPrice != null)
    .reduce((sum, order) => sum + (Number(order.unitPrice) - Number(order.unitCostPrice)) * Number(order.quantity), 0);
}



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
