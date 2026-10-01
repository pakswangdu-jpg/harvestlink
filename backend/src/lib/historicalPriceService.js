import { supabaseAdmin } from './supabaseClient.js';













const LOOKBACK_DAYS = 365;




const MIN_ORDER_COUNT = 3;
const MAX_ORDERS_CONSIDERED = 500;


const TREND_THRESHOLD_PERCENT = 5;

function round2(value) {
  return Math.round(value * 100) / 100;
}







function computeConfidence(orderCount) {
  return Math.max(30, Math.min(90, 30 + orderCount * 8));
}




function computeTrend(sortedPrices) {
  const midpoint = Math.floor(sortedPrices.length / 2);
  const earlier = sortedPrices.slice(0, midpoint);
  const later = sortedPrices.slice(midpoint);
  const earlierAvg = earlier.reduce((sum, value) => sum + value, 0) / earlier.length;
  const laterAvg = later.reduce((sum, value) => sum + value, 0) / later.length;
  const changePercent = ((laterAvg - earlierAvg) / earlierAvg) * 100;
  if (changePercent > TREND_THRESHOLD_PERCENT) return 'rising';
  if (changePercent < -TREND_THRESHOLD_PERCENT) return 'falling';
  return 'stable';
}










export async function getHistoricalPriceAnalysis(productName, unit) {
  const trimmedName = String(productName || '').trim();
  const trimmedUnit = String(unit || '').trim();
  if (!trimmedName || !trimmedUnit) return { matched: false };

  const sinceIso = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from('orders')
    .select('unit_price, created_at')
    .ilike('product_name', trimmedName)
    .eq('unit', trimmedUnit)
    .eq('payment_status', 'paid')
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: true })
    .limit(MAX_ORDERS_CONSIDERED);
  if (error) throw error;

  const prices = (data || [])
    .map((row) => Number(row.unit_price))
    .filter((price) => Number.isFinite(price) && price > 0);

  if (prices.length < MIN_ORDER_COUNT) return { matched: false };

  const orderCount = prices.length;
  const averagePrice = prices.reduce((sum, price) => sum + price, 0) / orderCount;
  const lowestPrice = Math.min(...prices);
  const highestPrice = Math.max(...prices);

  return {
    matched: true,
    orderCount,
    averagePrice: round2(averagePrice),
    lowestPrice: round2(lowestPrice),
    highestPrice: round2(highestPrice),
    trend: computeTrend(prices),
    confidence: computeConfidence(orderCount),




    recommendedPrice: round2(averagePrice),
  };
}
