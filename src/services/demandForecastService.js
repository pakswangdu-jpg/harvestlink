import { PRODUCT_CATEGORIES } from '../utils/constants';
import { getOrders } from './orderService';
import { getActiveProducts, getProducts } from './productService';

const EXCLUDED_ORDER_STATUSES = ['rejected', 'cancelled'];
// Demand-per-listing at or above this reads as "supply is stretched" — an active
// listing fielding this many units of demand on average is a legible, explainable cutoff.
const HIGH_DEMAND_PER_LISTING = 10;

// Estimates near-term buyer demand per crop category from recent order activity, and
// compares it against how many active listings currently exist in that category — a
// category with real demand but no (or thin) current supply is a signal worth surfacing
// to a farmer deciding what to plant or list next. This is a heuristic over real platform
// activity, not a statistical model — there's no historical depth yet to fit one to.
export function getDemandForecast(daysBack = 90) {
  const cutoff = Date.now() - daysBack * 24 * 60 * 60 * 1000;
  const productById = new Map(getProducts().map((product) => [product.id, product]));

  const recentOrders = getOrders().filter((order) => (
    !EXCLUDED_ORDER_STATUSES.includes(order.status) && new Date(order.createdAt).getTime() >= cutoff
  ));

  const activeListingsByCategory = new Map();
  getActiveProducts().forEach((product) => {
    activeListingsByCategory.set(product.category, (activeListingsByCategory.get(product.category) || 0) + 1);
  });

  const demandByCategory = new Map(PRODUCT_CATEGORIES.map((category) => [category, { category, orderCount: 0, quantityOrdered: 0 }]));
  recentOrders.forEach((order) => {
    const category = productById.get(order.productId)?.category || 'Other';
    const entry = demandByCategory.get(category) || { category, orderCount: 0, quantityOrdered: 0 };
    entry.orderCount += 1;
    entry.quantityOrdered += Number(order.quantity || 0);
    demandByCategory.set(category, entry);
  });

  return [...demandByCategory.values()]
    .map((entry) => {
      const activeListings = activeListingsByCategory.get(entry.category) || 0;
      const demandPerListing = entry.quantityOrdered / Math.max(activeListings, 1);

      let signal = 'none';
      if (entry.quantityOrdered > 0) {
        signal = activeListings === 0 || demandPerListing >= HIGH_DEMAND_PER_LISTING ? 'opportunity' : 'steady';
      }

      return { ...entry, activeListings, demandPerListing, signal };
    })
    .sort((a, b) => b.quantityOrdered - a.quantityOrdered);
}

export const DEMAND_SIGNAL_LABELS = {
  opportunity: 'Demand outpacing supply',
  steady: 'Demand met by current supply',
  none: 'No recent buyer demand',
};
