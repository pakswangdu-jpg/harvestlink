import Button from '../common/Button';
import { formatCurrency } from '../../utils/formatters';

// The full PSA-per-kg -> selling-unit breakdown, shown once a PSA (or admin-override)
// reference price is known for the matched commodity. Kept separate from ProductForm's own
// branching (loading / no PSA match / no recent data / has reference) so this specific,
// math-heavy piece stays easy to read and reason about on its own — it only ever receives
// already-computed numbers as props, no calculation happens in here.
export default function PriceRecommendationBreakdown({
  unit, kgPerUnitValue, referencePrice, equivalentPsaPricePerUnit, recommendedPrice, costPrice, onUsePrice,
}) {
  const cost = Number(costPrice);
  const hasCost = Number.isFinite(cost) && cost > 0;
  const profit = hasCost && recommendedPrice ? recommendedPrice.price - cost : null;

  return (
    <div className="price-breakdown">
      <Row label="PSA Farmgate Price" value={`${formatCurrency(referencePrice)}/kg`} />
      <Row label="Selected Unit" value={unit} />
      <Row label="Conversion" value={`${kgPerUnitValue} kg`} />
      {equivalentPsaPricePerUnit != null ? (
        <Row label="Equivalent PSA Price" value={`${formatCurrency(equivalentPsaPricePerUnit)}/${unit}`} />
      ) : null}
      {recommendedPrice ? (
        <>
          <Row label="Markup" value={`${recommendedPrice.marginPercent}%`} />
          <Row label="Recommended Selling Price" value={`${formatCurrency(recommendedPrice.price)}/${unit}`} emphasize />
          {/* Always shown, never just omitted when cost is missing — a farmer scanning this
              card for a profit figure that silently isn't there reads as broken, not as "go
              fill in another field." */}
          <Row
            label="Estimated Profit"
            value={profit != null ? formatCurrency(profit) : 'Enter your Cost per Unit to calculate your estimated profit.'}
            emphasize={profit != null}
          />
          <Button type="button" size="sm" variant="secondary" onClick={() => onUsePrice(recommendedPrice.price)}>
            Use this price
          </Button>
        </>
      ) : null}
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
