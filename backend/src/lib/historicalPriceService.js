import { supabaseAdmin } from './supabaseClient.js';

// Third pricing tier — only ever consulted once the caller already knows PSA has no
// reference for this product (see products.controller.js's getHistoricalPriceAnalysis).
// Deliberately platform-wide (every farmer's paid orders for this product name + unit, not
// just the one farmer listing it), matching PSA's own role as a market-wide reference price
// rather than one account's private sales history — a new farmer listing a crop other
// farmers already sell should still see a real market signal, not "no data" just because
// it's their own first time selling it.

// A real transaction older than this is too stale to represent "current market conditions"
// — long enough that a lightly-traded product still has a real chance to clear the minimum
// sample size below, short enough that a price from two seasons ago doesn't get treated as
// current.
const LOOKBACK_DAYS = 365;
// Below this many qualifying sales, there isn't enough data to responsibly call this a
// "market" average/trend at all — falls through to the cost-based estimate instead, same
// reasoning as the demand-forecast module's own minimum-sample-size gates elsewhere in this
// app.
const MIN_ORDER_COUNT = 3;
const MAX_ORDERS_CONSIDERED = 500;
// A swing smaller than this between the earlier and later half of the lookback window reads
// as noise, not a real trend — avoids reporting "Rising"/"Falling" off a 1-2% wobble.
const TREND_THRESHOLD_PERCENT = 5;

function round2(value) {
  return Math.round(value * 100) / 100;
}

// Simple, sample-size-only confidence — deliberately NOT the demand-forecast module's own
// computeConfidence (that one factors in weather/PSA/order-recency for a 30-90 day forward
// PRICE PROJECTION, a materially different and heavier claim than "here's what this actually
// sold for recently"). More real sales behind the average = more confidence in it, capped
// well short of 100 since even a large sample is still a plain average, not a market
// guarantee.
function computeConfidence(orderCount) {
  return Math.max(30, Math.min(90, 30 + orderCount * 8));
}

// Splits the (already chronologically sorted) sale prices in half and compares the two
// halves' averages — a plain, explainable signal a farmer can sanity-check themselves,
// rather than a fitted regression that's harder to trust at this sample size.
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

// Returns { matched: false } when there's genuinely not enough real sales data — never a
// fabricated/estimated fallback; the caller (ProductForm.jsx) drops to the cost-based
// estimate in that case instead. `productName`/`unit` are matched exactly as the farmer
// typed/selected them for THIS listing — case-insensitive on the name (orders snapshot
// whatever title-cased name the product had at checkout — see products.controller.js's
// titleCaseName), exact on unit (comparing a per-kg price against a per-sack price without a
// stored kg-per-unit on the order itself would be apples to oranges — see the comment on
// MIN_ORDER_COUNT above for the same "don't guess" principle applied to matching, not just
// to the stats themselves).
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
    // The recommendation IS the real average — no markup layered on top, since the whole
    // point of this tier is a figure grounded only in what buyers actually paid, not a
    // guess. See CostBasedEstimateCard.jsx for the (clearly separately labeled) cost+markup
    // estimate instead.
    recommendedPrice: round2(averagePrice),
  };
}
