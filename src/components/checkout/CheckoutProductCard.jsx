import { MapPin, Package, User } from 'lucide-react';
import { isLowStock } from '../../utils/constants';
import { formatCurrency, formatDate, formatQuantity, titleCase } from '../../utils/formatters';

// What am I buying? — the first thing on the checkout page, scannable in one glance instead
// of a flat label/value table where "Listed" reads with the same weight as "Price". Farmer/
// location/listed date are deliberately smaller and grouped below the price+stock, which are
// the two facts that actually drive the quantity decision below this card.
export default function CheckoutProductCard({ product }) {
  const isDiscounted = Boolean(product.discountPercent);

  return (
    <div className="panel checkout-product-card">
      <div className="checkout-product-media">
        {product.image ? <img src={product.image} alt={product.name} /> : <Package size={28} strokeWidth={1.5} />}
      </div>

      <div className="checkout-product-info">
        <div className="checkout-product-badges">
          <span className="category-pill">{titleCase(product.category)}</span>
          <span className={`badge badge-grade-${(product.grade || 'A').toLowerCase()}`}>Grade {product.grade || 'A'}</span>
          {product.sellingType === 'wholesale' ? <span className="badge badge-wholesale">Wholesale</span> : null}
          {isDiscounted ? <span className="badge badge-sale">-{product.discountPercent}%</span> : null}
        </div>

        <h2 className="checkout-product-name">{titleCase(product.name)}</h2>

        <div className="checkout-product-price-row">
          <span className="checkout-product-price">
            {formatCurrency(product.price)}<small>/{product.unit}</small>
          </span>
          {isDiscounted ? <span className="checkout-product-price-original">{formatCurrency(product.originalPrice)}</span> : null}
        </div>

        <p className="checkout-product-stock">
          {formatQuantity(product.quantity)} {product.unit} available
          {isLowStock(product.quantity) ? <span className="checkout-product-stock-low"> · Low stock</span> : null}
          {product.sellingType === 'wholesale' && product.moq ? ` · Min. order ${formatQuantity(product.moq)} ${product.unit}` : ''}
        </p>

        <div className="checkout-product-divider" />

        <div className="checkout-product-meta">
          <span><User size={13} strokeWidth={2} /> {product.farmerName}</span>
          <span><MapPin size={13} strokeWidth={2} /> {product.location}</span>
        </div>

        <p className="checkout-product-listed">Listed {formatDate(product.createdAt)}</p>
        {product.expirationDate ? (
          <p className="checkout-product-expiration">Expires {formatDate(product.expirationDate)}</p>
        ) : null}
      </div>
    </div>
  );
}
