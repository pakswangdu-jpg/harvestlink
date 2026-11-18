import { Minus, TrendingDown, TrendingUp } from 'lucide-react';
import Button from '../common/Button';
import { formatCurrency } from '../../utils/formatters';
import WholesalePriceRecommendation from './WholesalePriceRecommendation';

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






export default function HistoricalMarketAnalysisCard({
  analysis, unit, onUsePrice, wholesaleEnabled, costPrice, availableQuantity, onUseWholesalePrice,
  sellingType = 'retail',
}) {
  const {
    averagePrice, lowestPrice, highestPrice, trend, confidence, recommendedPrice, orderCount,
    aiSummary, aiRecommendation, estimatedProfit, estimatedMargin, estimatedTotal,
    recommendationMethod,
  } = analysis;
  const trendMeta = TREND_META[trend] || TREND_META.stable;
  const TrendIcon = trendMeta.icon;

  return (
    <div className="price-analysis-card tone-ai">
      <p className="price-analysis-card-title">AI-recommended price for this product</p>
      <p className="price-analysis-card-desc">
        Method: {recommendationMethod || 'Rule-based, evidence-validated'}
      </p>
      <p className="price-analysis-card-desc">
        PSA has no reference for this product — this is instead based on {orderCount} verified HarvestLink sale{orderCount === 1 ? '' : 's'} of it over the past year.
      </p>
      {aiSummary ? (
        <p className="price-analysis-card-desc"><strong>Market insight:</strong> {aiSummary}</p>
      ) : null}

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
        <Row label={`AI-recommended ${sellingType} price`} value={`${formatCurrency(recommendedPrice)}/${unit}`} emphasize />
        {estimatedProfit != null ? (
          <>
            <Row label="Estimated profit per unit" value={`${formatCurrency(estimatedProfit)}/${unit}`} />
            <Row label="Estimated selling margin" value={`${estimatedMargin.toFixed(1)}%`} />
            {estimatedTotal != null ? <Row label="Estimated stock total" value={formatCurrency(estimatedTotal)} /> : null}
          </>
        ) : null}
        <Button type="button" size="sm" variant="secondary" onClick={() => onUsePrice(recommendedPrice)}>
          Use AI-recommended price
        </Button>
        {wholesaleEnabled ? (
          <WholesalePriceRecommendation
            retailPrice={recommendedPrice}
            costPrice={costPrice}
            availableQuantity={availableQuantity}
            unit={unit}
            onUseRecommendation={onUseWholesalePrice}
          />
        ) : null}
      </div>
      {aiRecommendation ? (
        <p className="price-analysis-disclaimer"><strong>AI advice:</strong> {aiRecommendation}</p>
      ) : null}
    </div>
  );
}
