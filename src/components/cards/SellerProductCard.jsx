import { Package } from 'lucide-react';
import ZoomableImage from '../common/ZoomableImage';
import { formatCurrency, formatDate, titleCase } from '../../utils/formatters';
import { getProductExpirationInfo } from '../../utils/constants';
import ProductStatusBadge from '../products/ProductStatusBadge';
import ProductPriceReviewNotice from '../products/ProductPriceReviewNotice';

export default function SellerProductCard({ product, actions, onEdit }) {
  const isWholesale = product.sellingType === 'wholesale';
  const moq = Number(product.moq);
  const showDiscount = Number(product.discountPercent) > 0
    && Number.isFinite(Number(product.originalPrice))
    && Number.isFinite(Number(product.price))
    && Number(product.originalPrice) > Number(product.price);
  const expiry = getProductExpirationInfo(product.expirationDate);
  const expiryIndicatorClass = expiry.isExpired
    ? 'product-expiry-expired'
    : expiry.isExpiringSoon
      ? 'product-expiry-soon'
      : 'product-expiry-fresh';
  const expiryIndicatorText = expiry.isExpired
    ? 'Expired'
    : expiry.isExpiringSoon
      ? `Expiring Soon · ${expiry.detailText}`
      : expiry.detailText;

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
        <p className="product-mobile-card-grade">
          {isWholesale ? 'Wholesale' : 'Retail'} · Grade {product.grade || 'A'} · per {product.unit}
        </p>
        <div className="product-mobile-card-meta">
          <span className="product-mobile-card-price">
            {showDiscount ? <span className="muted price-original">{formatCurrency(product.originalPrice)}</span> : null}
            {formatCurrency(product.price)}/{product.unit}
          </span>
          {isWholesale && Number.isFinite(moq) && moq > 0 ? (
            <span className="product-mobile-card-stock">Min. order: {moq} {product.unit}</span>
          ) : null}
          <span className="product-mobile-card-stock">{product.quantity} {product.unit}</span>
          <ProductStatusBadge product={product} onEdit={onEdit} />
        </div>
        <p className="product-mobile-card-expiry">
          {expiry.status === 'none' ? (
            <span className="muted">Expires: Not specified</span>
          ) : (
            <>
              <span className="product-expiry-date">Expires {expiry.formattedDate}</span>
              {' · '}
              <span className={`product-expiry-indicator ${expiryIndicatorClass}`}>{expiryIndicatorText}</span>
            </>
          )}
        </p>
        <ProductPriceReviewNotice product={product} showSubmitted={['pending', 'needs_adjustment'].includes(product.priceReview?.status)} />
        <p className="product-mobile-card-updated">Updated {formatDate(product.updatedAt)}</p>
      </div>

      {actions ? <div className="product-mobile-card-actions">{actions}</div> : null}
    </article>
  );
}
