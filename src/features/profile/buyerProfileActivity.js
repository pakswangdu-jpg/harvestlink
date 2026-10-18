import { getTotalRevenue } from '../../services/reportService.js';

export function summarizeBuyerActivity(orders, ratings, buyerId) {
  const ordersById = new Map(orders.map((order) => [order.id, order]));
  const reviews = ratings.filter((review) => review.raterId === buyerId && ordersById.has(review.orderId));
  const latestReview = [...reviews].sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0))[0];
  return {
    totalOrders: orders.length,
    completedOrders: orders.filter((order) => order.status === 'completed').length,
    totalSpent: getTotalRevenue(orders),
    reviewsGiven: reviews.length,
    latestReview: latestReview ? { ...latestReview, order: ordersById.get(latestReview.orderId) } : null,
  };
}
