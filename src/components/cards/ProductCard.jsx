import { Link } from 'react-router-dom';
import { MapPin, Package } from 'lucide-react';
import StatusBadge from '../common/StatusBadge';
import { formatCurrency } from '../../utils/formatters';
import { isLowStock } from '../../utils/constants';

export default function ProductCard({ product, actions, showStatus = false }) {
  return (
    <article className="product-card">
      <Link to={`/products/${product.id}`} className="product-image-link">
        <div className="product-image">
          {product.image ? <img src={product.image} alt={product.name} /> : <Package size={42} />}
        </div>
      </Link>
      <div className="product-card-body">
        <div className="product-card-top">
          <span className="category-pill">{product.category}</span>
          <span className={`badge badge-grade-${(product.grade || 'A').toLowerCase()}`}>Grade {product.grade || 'A'}</span>
          {product.sellingType === 'wholesale' ? <span className="badge badge-wholesale">Wholesale</span> : null}
          {product.discountPercent ? <span className="badge badge-sale">-{product.discountPercent}%</span> : null}
          {isLowStock(product.quantity) ? <span className="badge badge-low-stock">Only {product.quantity} left</span> : null}
          {showStatus ? <StatusBadge value={product.status} /> : null}
        </div>
        <h3>{product.name}</h3>
        <p className="muted">{product.description}</p>
        <div className="product-meta">
          <span>
            <MapPin size={15} /> {product.location}
          </span>
          <span>{product.quantity} {product.unit} available</span>
        </div>
        {product.sellingType === 'wholesale' && product.moq ? (
          <p className="muted wholesale-min-note">Min. order (MOQ): {product.moq} {product.unit}</p>
        ) : null}
      </div>
      <div className="product-card-footer">
        <div className="price-block">
          {product.discountPercent ? <small className="price-original">{formatCurrency(product.originalPrice)}</small> : null}
          <strong>{formatCurrency(product.price)} / {product.unit}</strong>
        </div>
        {actions || (
          <Link className="btn btn-secondary btn-md" to={`/products/${product.id}`}>
            View
          </Link>
        )}
      </div>
    </article>
  );
}
