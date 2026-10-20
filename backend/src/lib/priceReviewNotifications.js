import { supabaseAdmin } from './supabaseClient.js';
import { createNotification } from './notify.js';

const PRICE_REVIEW_LINK = '/admin-price-monitoring';
const FARMER_PRODUCTS_LINK = '/farmer-products';

function formatPrice(price, unit) {
  return `PHP ${Number(price).toFixed(2)}/${unit}`;
}

async function sendPriceReviewNotification(notification) {
  try {
    await createNotification(notification);
  } catch (error) {
    console.error('Failed to send price review notification:', error.message);
  }
}

export async function notifyAdminsOfPriceReview(product) {
  let admins;
  try {
    const result = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('role', 'admin')
      .eq('account_status', 'active');
    if (result.error) {
      console.error('Failed to find active Admins for a price review notification:', result.error.message);
      return;
    }
    admins = result.data;
  } catch (error) {
    console.error('Failed to find active Admins for a price review notification:', error.message);
    return;
  }

  const farmerName = product.farmerName || 'A Farmer';
  await Promise.all((admins || []).map((admin) => sendPriceReviewNotification({
    userId: admin.id,
    type: 'market_price',
    title: 'Price review required',
    message: `${farmerName} submitted a new selling price for ${product.name}: ${formatPrice(product.price, product.unit)}.`,
    link: PRICE_REVIEW_LINK,
  })));
}

export async function notifyFarmerOfPriceDecision(product, decision) {
  const review = product.priceReview || {};
  let title;
  let message;
  if (decision === 'adjustment') {
    title = 'Price adjustment requested';
    message = `Your ${product.name} selling price of ${formatPrice(product.price, product.unit)} needs adjustment. Admin recommended a maximum of ${formatPrice(review.maxAllowedPrice, review.reviewUnit || product.unit)}.${review.declineReason ? ` Note: ${review.declineReason}` : ''}`;
  } else if (decision === 'approved') {
    title = 'Price approved';
    message = `Your ${product.name} price of ${formatPrice(product.price, product.unit)} has been approved.`;
  } else {
    title = 'Price review declined';
    message = `Your ${product.name} selling price review was declined.${review.declineReason ? ` Note: ${review.declineReason}` : ''}`;
  }

  await sendPriceReviewNotification({
    userId: product.farmerId,
    type: 'market_price',
    title,
    message,
    link: FARMER_PRODUCTS_LINK,
  });
}
