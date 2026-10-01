import { TriangleAlert } from 'lucide-react';
import Button from '../common/Button';
import { formatCurrency } from '../../utils/formatters';

function Row({ label, value, tone }) {
  return (
    <p className={`price-breakdown-row${tone ? ` ${tone}` : ''}`}>
      <span className="price-breakdown-label">{label}</span>
      <strong>{value}</strong>
    </p>
  );
}







export default function SellingBelowCostWarning({
  costPrice, unit, marketPriceLabel, marketPriceValue, marketPriceUnit, recommendedPrice, currentPrice,
}) {
  const loss = recommendedPrice.price - costPrice;

  const currentNum = Number(currentPrice);
  const hasCurrentPrice = Number.isFinite(currentNum) && currentNum > 0;
  const currentProfit = hasCurrentPrice ? currentNum - costPrice : null;

  return (
    <div className="price-analysis-card tone-danger">
      <p className="price-analysis-card-title"><TriangleAlert size={16} /> <span>Selling Below Cost</span></p>
      <p className="price-analysis-card-desc">
        The current {marketPriceLabel.toLowerCase()} is lower than your production cost. Selling at the recommended
        market price would result in a financial loss.
      </p>

      <div className="price-breakdown">
        <Row label="Cost per Unit" value={`${formatCurrency(costPrice)}/${unit}`} />
        <Row label={marketPriceLabel} value={`${formatCurrency(marketPriceValue)}/${marketPriceUnit}`} />
        <Row label="AI Recommended Price" value={`${formatCurrency(recommendedPrice.price)}/${unit}`} />
        <Row label="Expected Loss" value={formatCurrency(loss)} tone="loss" />
        <Button type="button" size="sm" variant="secondary" disabled title="Disabled — this recommendation would sell at a loss">
          Use this price
        </Button>
      </div>

      {



                                      }
      {hasCurrentPrice ? (
        <div className="price-breakdown">
          <Row
            label={`At your entered price (${formatCurrency(currentNum)}/${unit})`}
            value={`${currentProfit > 0 ? 'Profit' : 'Loss'}: ${formatCurrency(Math.abs(currentProfit))}`}
            tone={currentProfit > 0 ? 'profit' : 'loss'}
          />
        </div>
      ) : null}

      <div className="price-analysis-suggestions">
        <p className="price-analysis-card-title">Recommendations</p>
        <ul>
          <li>Reduce production costs.</li>
          <li>Wait for better market prices.</li>
          <li>Increase value through better quality or packaging.</li>
          <li>Set a higher selling price if local demand supports it.</li>
        </ul>
      </div>
    </div>
  );
}
