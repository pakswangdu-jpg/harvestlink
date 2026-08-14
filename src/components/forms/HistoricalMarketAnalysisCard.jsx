import { Minus, TrendingDown, TrendingUp } from 'lucide-react';
import Button from '../common/Button';
import { formatCurrency } from '../../utils/formatters';

const TREND_META = {
  rising: { label: 'Rising', icon: TrendingUp, className: 'trend-up' },
  falling: { label: 'Falling', icon: TrendingDown, className: 'trend-down' },
  stable: { label: 'Stable', icon: Minus, className: 'trend-flat' },
};

function Row({ label, value, emphasize }) {
  return (
    <p className={`price-breakdown-row${emphasize ? ' emphasize' : ''}`}>
      <span className="price-breakdown-label">{label}</span>
      <strong>{value}</strong>
    </p>
  );
}

// Green, same "AI Market Recommendation" tier as the PSA card — the recommendation here is
// still grounded in real, verified sales (see historicalPriceService.js: platform-wide paid
// orders for this exact product name + unit, requires at least 3 to even reach this card),
// just from HarvestLink's own transaction history instead of PSA's, for a product PSA
// doesn't track. Only ever rendered when PSA itself has nothing for this product.
export default function HistoricalMarketAnalysisCard({ analysis, unit, onUsePrice }) {
  const {
    averagePrice, lowestPrice, highestPrice, trend, confidence, recommendedPrice, orderCount,
  } = analysis;
  const trendMeta = TREND_META[trend] || TREND_META.stable;
  const TrendIcon = trendMeta.icon;

  return (
    <div className="price-analysis-card tone-ai">
      <p className="price-analysis-card-title">Historical Market Analysis</p>
      <p className="price-analysis-card-desc">
        PSA has no reference for this product — this is instead based on {orderCount} verified HarvestLink sale{orderCount === 1 ? '' : 's'} of it over the past year.
      </p>

      <div className="price-breakdown">
        <Row label="Average Selling Price" value={`${formatCurrency(averagePrice)}/${unit}`} />
        <Row label="Lowest Price" value={`${formatCurrency(lowestPrice)}/${unit}`} />
        <Row label="Highest Price" value={`${formatCurrency(highestPrice)}/${unit}`} />
        <Row
          label="Market Trend"
          value={(
            <span className={`price-trend-value ${trendMeta.className}`}>
              <TrendIcon size={14} /> {trendMeta.label}
            </span>
          )}
        />
        <Row label="Confidence Score" value={`${confidence}%`} />
        <Row label="AI Recommended Selling Price" value={`${formatCurrency(recommendedPrice)}/${unit}`} emphasize />
        <Button type="button" size="sm" variant="secondary" onClick={() => onUsePrice(recommendedPrice)}>
          Use this price
        </Button>
      </div>
    </div>
  );
}
