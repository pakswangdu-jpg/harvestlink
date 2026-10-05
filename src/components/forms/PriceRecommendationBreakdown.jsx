import Button from '../common/Button';
import { formatCurrency } from '../../utils/formatters';
import WholesalePriceRecommendation from './WholesalePriceRecommendation';






export default function PriceRecommendationBreakdown({
  unit, kgPerUnitValue, referencePrice, equivalentPsaPricePerUnit, recommendedPrice, costPrice, onUsePrice,
  wholesaleEnabled, availableQuantity, onUseWholesalePrice,
  sellingType = 'retail',
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
          <Row label={`Recommended ${sellingType} price`} value={`${formatCurrency(recommendedPrice.price)}/${unit}`} emphasize />
          {

                                        }
          <Row
            label="Estimated Profit"
            value={profit != null ? formatCurrency(profit) : 'Enter your Cost per Unit to calculate your estimated profit.'}
            emphasize={profit != null}
          />
          <Button type="button" size="sm" variant="secondary" onClick={() => onUsePrice(recommendedPrice.price)}>
            Use {sellingType} price
          </Button>
          {wholesaleEnabled ? (
            <WholesalePriceRecommendation
              retailPrice={recommendedPrice.price}
              costPrice={cost}
              availableQuantity={availableQuantity}
              unit={unit}
              onUseRecommendation={onUseWholesalePrice}
            />
          ) : null}
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
