import Button from '../common/Button';
import { formatCurrency } from '../../utils/formatters';






export default function PriceRecommendationBreakdown({
  unit, referenceUnit, referencePrice, recommendedPrice, estimatedTotal, quantity, priceRange,
  marketTrend, adjustmentPercent, costPrice, estimatedProfit, profitMargin, whyThisPrice,
  dataSource, dataUpdatedAt, aiSummary, aiRecommendation, onUsePrice,
  recommendationMethod,
}) {
  return (
    <div className="price-breakdown">
      <Row label="Reference price" value={`${formatCurrency(referencePrice)}/${referenceUnit}`} />
      {marketTrend ? <Row label="Market trend" value={marketTrend} /> : null}
      {adjustmentPercent != null ? (
        <Row label="Price adjustment" value={`${adjustmentPercent > 0 ? '+' : ''}${adjustmentPercent}%`} />
      ) : null}
      {priceRange ? (
        <Row
          label={`Suggested range (±${priceRange.percent}%)`}
          value={`${formatCurrency(priceRange.minimumPrice)}–${formatCurrency(priceRange.maximumPrice)}/${unit}`}
        />
      ) : null}
      {recommendedPrice ? (
        <>
          <Row label="AI-recommended selling price" value={`${formatCurrency(recommendedPrice.price)}/${unit}`} emphasize />
          <Row label={Number(quantity) > 0 ? `Estimated total (${quantity} ${unit})` : 'Estimated total'} value={Number(quantity) > 0 && estimatedTotal != null ? formatCurrency(estimatedTotal) : 'Enter a quantity to estimate total'} />
          {estimatedProfit != null ? (
            <>
              <Row label="Estimated profit per unit" value={`${formatCurrency(estimatedProfit)}/${unit}`} />
              <Row label="Profit margin" value={`${profitMargin != null ? `${profitMargin}%` : 'Unavailable'}`} />
            </>
          ) : null}
          <Button type="button" size="sm" variant="secondary" onClick={() => onUsePrice(recommendedPrice.price)}>
            Use AI-recommended price
          </Button>
          {whyThisPrice ? (
            <div className="price-analysis-explanation">
              <strong>Why this price?</strong>
                  <p>Method: {recommendationMethod || 'Rule-based, evidence-validated'}</p>
              <p>{whyThisPrice}</p>
              {costPrice != null ? (
                <p>Calculation: {formatCurrency(referencePrice)} × (1 + {adjustmentPercent != null ? `${adjustmentPercent}` : '0'}%) = {formatCurrency(recommendedPrice.price)}{costPrice != null ? `; profit = ${formatCurrency(recommendedPrice.price)} − ${formatCurrency(costPrice)} = ${formatCurrency(estimatedProfit || 0)}/${unit}` : ''}.</p>
              ) : (
                <p>Calculation: {formatCurrency(referencePrice)} × (1 + {adjustmentPercent != null ? `${adjustmentPercent}` : '0'}%) = {formatCurrency(recommendedPrice.price)}.</p>
              )}
              {aiSummary ? <p><strong>AI market insight:</strong> {aiSummary}</p> : null}
              {aiRecommendation ? <p><strong>AI advice:</strong> {aiRecommendation}</p> : null}
              <p className="price-analysis-source">Source: {dataSource === 'psa' ? 'PSA Central Visayas' : dataSource === 'admin_entered' ? 'HarvestLink admin market reference' : 'Verified local market'}{dataUpdatedAt ? ` · Updated ${dataUpdatedAt}` : ''}</p>
            </div>
          ) : null}
        </>
      ) : <Row label="Recommended selling price" value="Unavailable for this unit" emphasize />}
    </div>
  );
}

function Row({ label, value, emphasize }) {
  return (
    <p className={`price-breakdown-row${emphasize ? ' emphasize' : ''}`}>
      <span className="price-breakdown-label">{label}</span>
      <strong>{value}</strong>
    </p>
  );
}
