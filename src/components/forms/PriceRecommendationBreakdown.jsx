import Button from '../common/Button';
import { formatCurrency } from '../../utils/formatters';






export default function PriceRecommendationBreakdown({
  unit, referenceUnit, referencePrice, recommendedPrice, estimatedTotal, quantity, onUsePrice,
}) {
  return (
    <div className="price-breakdown">
      <Row label="Reference price" value={`${formatCurrency(referencePrice)}/${referenceUnit}`} />
      {recommendedPrice ? (
        <>
          <Row label="Recommended selling price" value={`${formatCurrency(recommendedPrice.price)}/${unit}`} emphasize />
          <Row label={Number(quantity) > 0 ? `Estimated total (${quantity} ${unit})` : 'Estimated total'} value={Number(quantity) > 0 && estimatedTotal != null ? formatCurrency(estimatedTotal) : 'Enter a quantity to estimate total'} />
          <Button type="button" size="sm" variant="secondary" onClick={() => onUsePrice(recommendedPrice.price)}>
            Use recommended price
          </Button>
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
