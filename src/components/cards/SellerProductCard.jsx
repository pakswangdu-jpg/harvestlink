import { Package } from 'lucide-react';
import ZoomableImage from '../common/ZoomableImage';
import { formatCurrency, formatDate, titleCase } from '../../utils/formatters';
import ProductStatusBadge from '../products/ProductStatusBadge';
import ProductPriceReviewNotice from '../products/ProductPriceReviewNotice';






export default function SellerProductCard({ product, actions, onEdit }) {

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
          <ProductStatusBadge product={product} onEdit={onEdit} />
        </div>
        <ProductPriceReviewNotice product={product} showSubmitted={['pending', 'needs_adjustment'].includes(product.priceReview?.status)} />
        <p className="product-mobile-card-updated">Updated {formatDate(product.updatedAt)}</p>
      </div>

      {actions ? <div className="product-mobile-card-actions">{actions}</div> : null}
    </article>
  );
}
