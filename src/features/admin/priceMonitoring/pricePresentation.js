import { getFixedKgPerUnit } from '../../../utils/unitConversion';
import { formatCurrency } from '../../../utils/formatters';

export function priceDifference(price, reference) {
  if (!Number.isFinite(price) || !Number.isFinite(reference) || reference <= 0) return null;
  const difference = price - reference;
  const percent = difference / reference * 100;
  return { difference, percent, label: `${difference > 0 ? '+' : difference < 0 ? '-' : ''}${formatCurrency(Math.abs(difference))} / ${percent > 0 ? '+' : ''}${percent.toFixed(1)}%` };
}

export function listingComparison(product, commodity) {
  if (!commodity || commodity.loading) return null;
  const kg = getFixedKgPerUnit(product.unit) ?? (Number(product.kgPerUnit) > 0 ? Number(product.kgPerUnit) : null);
  if (!kg) return null;
  return priceDifference(Number(product.price) / kg, commodity.referencePrice);
}
