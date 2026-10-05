import { formatCurrency, formatQuantity } from '../../utils/formatters';
import { getRecommendedWholesalePrice, getSuggestedWholesaleMinimum } from '../../../backend/shared/pricing.js';

export default function WholesalePriceRecommendation({
  retailPrice,
  costPrice,
  availableQuantity,
  unit,
  onUseRecommendation,
}) {
  const wholesalePrice = getRecommendedWholesalePrice(retailPrice, costPrice);
  const minimumQuantity = getSuggestedWholesaleMinimum(availableQuantity);
  if (minimumQuantity == null) {
    return <p className="wholesale-recommendation-warning">Enter available stock to calculate a wholesale minimum.</p>;
  }
  if (wholesalePrice == null) {
    return (
      <p className="wholesale-recommendation-warning">
        Market price is close to or below your entered cost. Review your cost before applying a wholesale recommendation.
      </p>
    );
  }

  const retailProfit = Number(retailPrice) - Number(costPrice);
  const wholesaleProfit = wholesalePrice - Number(costPrice);
  const savings = Number(retailPrice) - wholesalePrice;

  return (
    <div className="wholesale-recommendation">
      <p className="price-breakdown-row emphasize">
        <span className="price-breakdown-label">Recommended wholesale price</span>
        <strong>{formatCurrency(wholesalePrice)}/{unit}</strong>
      </p>
      <p className="price-breakdown-row">
        <span className="price-breakdown-label">Wholesale starts at</span>
        <strong>{formatQuantity(minimumQuantity)} {unit}</strong>
      </p>
      <p className="price-breakdown-row">
        <span className="price-breakdown-label">Estimated retail profit</span>
        <strong>{formatCurrency(retailProfit)}/{unit}</strong>
      </p>
      <p className="price-breakdown-row">
        <span className="price-breakdown-label">Estimated wholesale profit</span>
        <strong>{formatCurrency(wholesaleProfit)}/{unit}</strong>
      </p>
      <p className="wholesale-recommendation-note">
        {formatCurrency(savings)}/{unit} lower than retail. The bulk price shares the retail margin while remaining above your entered cost.
      </p>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => onUseRecommendation({ price: wholesalePrice, minimumQuantity })}
      >
        Use wholesale recommendation
      </button>
    </div>
  );
}
