import Button from '../common/Button';
import { formatCurrency } from '../../utils/formatters';
import { calculateEstimatedTotal, parseOptionalPositiveNumber } from '../../../backend/shared/pricing.js';

export default function PriceRecommendationBreakdown({
  unit, referenceUnit, referencePrice, recommendedPrice, estimatedTotal, quantity, priceRange,
  marketTrend, adjustmentPercent, costPrice, estimatedProfit, profitMargin, whyThisPrice,
  dataSource, dataUpdatedAt, aiSummary, aiRecommendation, onUsePrice,
  recommendationMethod, salesType = 'retail', currentPrice = '',
}) {
  const isWholesale = salesType === 'wholesale';
  const validQuantity = parseOptionalPositiveNumber(quantity);
  const computedEstimatedTotal = recommendedPrice
    ? calculateEstimatedTotal(recommendedPrice.price, validQuantity) ?? estimatedTotal
    : null;

  const breakEvenCost = recommendedPrice?.breakEvenCost ?? costPrice ?? null;
  const enteredPriceNum = parseOptionalPositiveNumber(currentPrice);
  const isEnteredPriceBelowBreakEven = enteredPriceNum != null
    && breakEvenCost != null
    && enteredPriceNum < breakEvenCost;

  const sourceLabel = dataSource === 'psa'
    ? 'PSA Central Visayas'
    : dataSource === 'admin_entered'
      ? 'HarvestLink admin market reference'
      : dataSource === 'verified_local_market'
        ? 'Verified local market survey'
        : 'Farmer cost-based calculation';

  const formulaLines = Array.isArray(recommendedPrice?.formulaLines) && recommendedPrice.formulaLines.length > 0
    ? recommendedPrice.formulaLines
    : [];

  return (
    <div className="price-breakdown">
      {referencePrice != null ? (
        <Row
          label={isWholesale ? 'Wholesale reference price' : 'Retail reference price'}
          value={`${formatCurrency(referencePrice)}/${referenceUnit}`}
        />
      ) : null}
      {!isWholesale && marketTrend ? <Row label="Market trend" value={marketTrend} /> : null}
      {!isWholesale && adjustmentPercent != null ? (
        <Row label="Price adjustment" value={`${adjustmentPercent > 0 ? '+' : ''}${adjustmentPercent}%`} />
      ) : null}
      {!isWholesale && priceRange ? (
        <Row
          label={`Suggested range (±${priceRange.percent}%)`}
          value={`${formatCurrency(priceRange.minimumPrice)}–${formatCurrency(priceRange.maximumPrice)}/${unit}`}
        />
      ) : null}

      {isWholesale && recommendedPrice?.moqExceedsStock ? (
        <p className="price-analysis-warning-note">
          MOQ ({recommendedPrice.moq} {unit}) exceeds available stock ({quantity} {unit}). Adjust MOQ or available quantity to calculate wholesale pricing.
        </p>
      ) : null}

      {isWholesale && recommendedPrice?.handlingCostPerUnit != null ? (
        <Row label={`Handling cost per ${unit}`} value={`${formatCurrency(recommendedPrice.handlingCostPerUnit)}/${unit}`} />
      ) : null}
      {isWholesale && recommendedPrice?.totalCostPerUnit != null ? (
        <Row label={`Total cost per ${unit} (break-even)`} value={`${formatCurrency(recommendedPrice.totalCostPerUnit)}/${unit}`} />
      ) : null}

      {recommendedPrice ? (
        <>
          <Row
            label={isWholesale ? 'Recommended wholesale price' : 'Recommended retail price'}
            value={`${formatCurrency(recommendedPrice.price)}/${unit}`}
            emphasize
          />

          {isWholesale && recommendedPrice.minimumOrderTotal != null ? (
            <Row
              label={`Minimum order total (${recommendedPrice.moq} ${unit} MOQ)`}
              value={formatCurrency(recommendedPrice.minimumOrderTotal)}
            />
          ) : null}

          {isWholesale && recommendedPrice.totalExpenses != null ? (
            <Row
              label={`Total expenses (${recommendedPrice.moq} ${unit} MOQ)`}
              value={formatCurrency(recommendedPrice.totalExpenses)}
            />
          ) : null}

          {isWholesale && recommendedPrice.estimatedGrossProfit != null ? (
            <Row
              label={`Estimated gross profit (${recommendedPrice.moq} ${unit} MOQ)`}
              value={formatCurrency(recommendedPrice.estimatedGrossProfit)}
              emphasize
            />
          ) : null}

          <Row
            label={validQuantity != null
              ? `${isWholesale ? 'Estimated stock value' : 'Estimated total'} (${validQuantity} ${unit})`
              : (isWholesale ? 'Estimated stock value' : 'Estimated total')}
            value={validQuantity != null && computedEstimatedTotal != null
              ? formatCurrency(computedEstimatedTotal)
              : 'Enter a quantity to estimate total'}
          />

          {estimatedProfit != null ? (
            <>
              <Row label="Estimated profit per unit" value={`${formatCurrency(estimatedProfit)}/${unit}`} />
              <Row label="Profit margin" value={profitMargin != null ? `${profitMargin}%` : 'Unavailable'} />
            </>
          ) : null}

          {isEnteredPriceBelowBreakEven ? (
            <p className="price-analysis-warning-note">
              Warning: Your entered selling price ({formatCurrency(enteredPriceNum)}/{unit}) is below your calculated break-even cost ({formatCurrency(breakEvenCost)}/{unit}).
            </p>
          ) : null}

          <Button type="button" size="sm" variant="secondary" onClick={() => onUsePrice(recommendedPrice.price)}>
            {isWholesale ? 'Use recommended wholesale price' : 'Use AI-recommended price'}
          </Button>

          {whyThisPrice || formulaLines.length > 0 ? (
            <div className="price-analysis-explanation">
              <strong>Why this price?</strong>
              <p>Method: {recommendationMethod || 'Rule-based, evidence-validated'}</p>
              {recommendedPrice.insufficientMarketData ? (
                <p><strong>Market data notice:</strong> {isWholesale ? 'Verified wholesale market data is currently unavailable for this product.' : 'Insufficient recent market trend data — reference price used without unsupported adjustments.'}</p>
              ) : null}
              {whyThisPrice ? <p>{whyThisPrice}</p> : null}
              {recommendedPrice.wholesaleVsRetailExplanation ? (
                <p><strong>Wholesale vs. Retail:</strong> {recommendedPrice.wholesaleVsRetailExplanation}</p>
              ) : null}
              {formulaLines.length > 0 ? (
                <div>
                  {formulaLines.map((line) => <p key={line}>{line}</p>)}
                </div>
              ) : (
                <p>Calculation: {formatCurrency(referencePrice)} × (1 + {adjustmentPercent != null ? `${adjustmentPercent}` : '0'}%) = {formatCurrency(recommendedPrice.price)}{costPrice != null ? `; profit = ${formatCurrency(recommendedPrice.price)} − ${formatCurrency(costPrice)} = ${formatCurrency(estimatedProfit || 0)}/${unit}` : ''}.</p>
              )}
              {aiSummary ? <p><strong>AI market insight:</strong> {aiSummary}</p> : null}
              {aiRecommendation ? <p><strong>AI advice:</strong> {aiRecommendation}</p> : null}
              <p className="price-analysis-source">
                Source: {sourceLabel}{dataUpdatedAt ? ` · Effective ${dataUpdatedAt}` : ''}
              </p>
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
