import { Package } from 'lucide-react';
import ZoomableImage from '../common/ZoomableImage';
import { formatCurrency, titleCase } from '../../utils/formatters';
import { getProductStatusInfo } from '../../utils/constants';

// The mobile counterpart to ProductTable.jsx's row — same six facts (thumbnail/name/grade,
// price, stock, status), restacked into a compact card instead of a table row, plus the same
// Edit + "..." actions. Deliberately drops the extra badges (category, wholesale, discount %,
// expiry) a farmer would previously see here — those still surface via Edit; this list's job
// is fast scanning, not showing everything at once.
export default function SellerProductCard({ product, actions }) {
  const { value: statusValue, label: statusLabel } = getProductStatusInfo(product);

  return (
    <article className="product-mobile-card">
      <div className="product-row-thumb">
        {product.image ? (
          <ZoomableImage src={product.image} alt={product.name} fallbackMessage="Image unavailable" />
        ) : (
          <Package size={16} className="text-[var(--text-faint)]" />
        )}
      </div>

      <div className="product-mobile-card-info">
        <p className="product-mobile-card-name">{titleCase(product.name)}</p>
        <p className="product-mobile-card-grade">Grade {product.grade || 'A'} · per {product.unit}</p>
        <div className="product-mobile-card-meta">
          <span className="product-mobile-card-price">{formatCurrency(product.price)}</span>
          <span className="product-mobile-card-stock">{product.quantity} {product.unit}</span>
          <span className={`badge badge-${statusValue}`}>{statusLabel}</span>
        </div>
      </div>

      {actions ? <div className="product-mobile-card-actions">{actions}</div> : null}
    </article>
  );
}
