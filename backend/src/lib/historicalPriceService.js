import { supabaseAdmin } from './supabaseClient.js';
import { generateProductPriceInsight } from './geminiService.js';













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










export async function getHistoricalPriceAnalysis(productName, unit, options = {}) {
  const trimmedName = String(productName || '').trim();
  const trimmedUnit = String(unit || '').trim();
  if (!trimmedName || !trimmedUnit) return { matched: false };
  const normalizedName = trimmedName.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
  const normalizedUnit = trimmedUnit.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
  const costPrice = Number(options.costPrice);
  const quantity = Number(options.quantity);
  const costPerUnit = Number.isFinite(costPrice) && costPrice > 0 ? costPrice : null;
  const estimatedQuantity = Number.isFinite(quantity) && quantity >= 0 ? quantity : 0;

  const sinceIso = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from('orders')
    .select('product_name, unit, unit_price, created_at')
    .eq('payment_status', 'paid')
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: true })
    .limit(MAX_ORDERS_CONSIDERED);
  if (error) throw error;

  const exactRows = (data || []).filter((row) => {
    const rowName = String(row.product_name || '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
    const rowUnit = String(row.unit || '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
    return rowName === normalizedName && rowUnit === normalizedUnit;
  });

  const prices = exactRows
    .map((row) => Number(row.unit_price))
    .filter((price) => Number.isFinite(price) && price > 0);

  if (prices.length < MIN_ORDER_COUNT) return { matched: false };

  const orderCount = prices.length;
  const averagePrice = prices.reduce((sum, price) => sum + price, 0) / orderCount;
  const lowestPrice = Math.min(...prices);
  const highestPrice = Math.max(...prices);
  const trend = computeTrend(prices);
  const average = round2(averagePrice);
  const costAdjustedPrice = costPerUnit
    ? round2(Math.max(average, costPerUnit * 1.15))
    : average;
  const estimatedProfit = costPerUnit
    ? round2(costAdjustedPrice - costPerUnit)
    : null;
  const estimatedMargin = costPerUnit && costAdjustedPrice > 0
    ? round2((estimatedProfit / costAdjustedPrice) * 100)
    : null;
  const estimatedTotal = estimatedQuantity > 0
    ? round2(costAdjustedPrice * estimatedQuantity)
    : null;

  const aiInsight = await generateProductPriceInsight({
    productName: trimmedName,
    unit: trimmedUnit,
    orderCount,
    averagePrice: average,
    lowestPrice: round2(lowestPrice),
    highestPrice: round2(highestPrice),
    trend,
    costPrice: costPerUnit,
    recommendedPrice: costAdjustedPrice,
    estimatedProfit,
    estimatedMargin,
  });

  const recommendationMethod = aiInsight
    ? 'Gemini-assisted, evidence-validated'
    : 'Rule-based, evidence-validated';

  return {
    matched: true,
    orderCount,
    averagePrice: average,
    lowestPrice: round2(lowestPrice),
    highestPrice: round2(highestPrice),
    trend,
    confidence: computeConfidence(orderCount),
    recommendedPrice: costAdjustedPrice,
    costAdjustedPrice,
    estimatedProfit,
    estimatedMargin,
    estimatedTotal,
    aiSummary: aiInsight?.summary || null,
    aiRecommendation: aiInsight?.recommendation || null,
    recommendationMethod,
  };
}
