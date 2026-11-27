import { TriangleAlert } from 'lucide-react';
import Button from '../common/Button';
import { formatCurrency } from '../../utils/formatters';
import WholesalePriceRecommendation from './WholesalePriceRecommendation';
import { calculateWholesalePricing } from '../../../backend/shared/pricing.js';

function Row({ label, value, emphasize }) {
  return (
    <p className={`price-breakdown-row${emphasize ? ' emphasize' : ''}`}>
      <span className="price-breakdown-label">{label}</span>
      <strong>{value}</strong>
    </p>
  );
}

export default function CostBasedEstimateCard({
  costPrice, unit, markupPercent, onMarkupChange, isImplausible, costPerKg,
  wholesaleEnabled, availableQuantity, onUseWholesalePrice,
  sellingType = 'retail', moq = '', handlingCostPerOrder = '', targetProfitMargin = '',
  currentPrice = '', onUsePrice,
}) {
  if (isImplausible) {
    return (
      <div className="price-analysis-card tone-cost warning">
        <p className="price-analysis-card-title"><TriangleAlert size={15} /> <span>That cost looks unusually high for produce</span></p>
        <p className="price-analysis-card-desc">
          {costPerKg != null ? `≈ ${formatCurrency(costPerKg)}/kg. ` : ''}
          Double-check it — an unrealistic cost like this will block saving this listing until it&apos;s corrected.
        </p>
      </div>
    );
  }

  if (sellingType === 'wholesale') {
    const wholesale = calculateWholesalePricing({
      productionCost: costPrice,
      handlingCostPerOrder,
      moq,
      availableQuantity,
      targetProfitMargin,
      sellingPrice: currentPrice,
      unit,
    });

    return (
      <div className="price-analysis-card tone-cost">
        <p className="price-analysis-card-title">Cost-Based Wholesale Price Estimate</p>
        <p className="price-analysis-card-desc">
          No verified wholesale market data exists for this product — this estimate is calculated from your production cost, handling cost per order, MOQ, and target profit margin.
        </p>

        <div className="price-breakdown">
          <Row label="Production cost per unit" value={`${formatCurrency(costPrice)}/${unit}`} />
          {wholesale.moqExceedsStock ? (
            <p className="price-analysis-warning-note">
              MOQ ({wholesale.moq} {unit}) exceeds available stock ({availableQuantity} {unit}). Adjust MOQ or stock to calculate wholesale pricing.
            </p>
          ) : null}
          {wholesale.handlingCostPerUnit != null ? (
            <Row label={`Handling cost per ${unit}`} value={`${formatCurrency(wholesale.handlingCostPerUnit)}/${unit}`} />
          ) : null}
          {wholesale.totalCostPerUnit != null ? (
            <Row label={`Total cost per ${unit} (break-even)`} value={`${formatCurrency(wholesale.totalCostPerUnit)}/${unit}`} />
          ) : null}
          {wholesale.recommendedCostBasedPrice != null ? (
            <>
              <Row label="Recommended wholesale price" value={`${formatCurrency(wholesale.recommendedCostBasedPrice)}/${unit}`} emphasize />
              {wholesale.minimumOrderTotal != null ? (
                <Row label={`Minimum order total (${wholesale.moq} ${unit} MOQ)`} value={formatCurrency(wholesale.minimumOrderTotal)} />
              ) : null}
              {wholesale.totalExpenses != null ? (
                <Row label={`Total expenses (${wholesale.moq} ${unit} MOQ)`} value={formatCurrency(wholesale.totalExpenses)} />
              ) : null}
              {wholesale.estimatedGrossProfit != null ? (
                <Row label={`Estimated gross profit (${wholesale.moq} ${unit} MOQ)`} value={formatCurrency(wholesale.estimatedGrossProfit)} emphasize />
              ) : null}
              {wholesale.estimatedStockValue != null ? (
                <Row label={`Estimated stock value (${wholesale.availableQuantity} ${unit})`} value={formatCurrency(wholesale.estimatedStockValue)} />
              ) : null}
              {onUsePrice ? (
                <Button type="button" size="sm" variant="secondary" onClick={() => onUsePrice(wholesale.recommendedCostBasedPrice)}>
                  Use recommended wholesale price
                </Button>
              ) : null}
            </>
          ) : (
            <p className="price-analysis-prompt">
              Enter MOQ and target profit margin (0%–99.9%) to calculate a cost-based wholesale price.
            </p>
          )}
          {wholesale.isEnteredPriceBelowBreakEven ? (
            <p className="price-analysis-warning-note">
              Warning: Your entered selling price ({formatCurrency(Number(currentPrice))}/{unit}) is below your calculated break-even cost ({formatCurrency(wholesale.breakEvenCost)}/{unit}).
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  const markup = Number(markupPercent);
  const hasMarkup = Number.isFinite(markup) && markup >= 0;
  const sellingPrice = hasMarkup ? costPrice * (1 + markup / 100) : null;
  const profit = sellingPrice != null ? sellingPrice - costPrice : null;
  const margin = sellingPrice ? (profit / sellingPrice) * 100 : null;

  return (
    <div className="price-analysis-card tone-cost">
      <p className="price-analysis-card-title">Cost-Based Price Estimate</p>
      <p className="price-analysis-card-desc">
        This is NOT an AI recommendation — it&apos;s calculated only from the cost and markup below.
      </p>

      <div className="price-breakdown">
        <Row label="Cost per Unit" value={`${formatCurrency(costPrice)}/${unit}`} />
        <p className="price-breakdown-row">
          <span className="price-breakdown-label">Markup Percentage</span>
          <label className="price-analysis-inline-input">
            <input
              type="number"
              min="0"
              step="1"
              value={markupPercent}
              onChange={(event) => onMarkupChange(event.target.value)}
              aria-label="Markup percentage"
            />
            <span>%</span>
          </label>
        </p>
        {sellingPrice != null ? (
          <>
            <Row label="Estimated Selling Price" value={`${formatCurrency(sellingPrice)}/${unit}`} emphasize />
            <Row label="Estimated Profit" value={formatCurrency(profit)} emphasize />
            <Row label="Profit Margin" value={`${margin.toFixed(1)}%`} />
            {wholesaleEnabled ? (
              <WholesalePriceRecommendation
                retailPrice={sellingPrice}
                costPrice={costPrice}
                availableQuantity={availableQuantity}
                unit={unit}
                onUseRecommendation={onUseWholesalePrice}
              />
            ) : null}
          </>
        ) : null}
      </div>

      <p className="price-analysis-disclaimer">
        This estimate is calculated only from your production cost because no verified market data exists.
      </p>
    </div>
  );
}
