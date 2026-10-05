import { TriangleAlert } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';
import WholesalePriceRecommendation from './WholesalePriceRecommendation';

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

      {

                                                                                      }
      <p className="price-analysis-disclaimer">
        This estimate is calculated only from your production cost because no verified market data exists.
      </p>
    </div>
  );
}
