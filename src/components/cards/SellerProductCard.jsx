import { Link } from 'react-router-dom';
import { Calendar, Clock, MapPin, Package } from 'lucide-react';
import StatusBadge from '../common/StatusBadge';
import { formatCurrency, formatDate, titleCase } from '../../utils/formatters';
import { getExpiryStatus, isLowStock } from '../../utils/constants';

// Seller-facing inventory row — deliberately its own component rather than a restyle of
// the shared ProductCard (used by BuyerDashboard/Marketplace/PublicFarmerProfile for the
// buyer-facing catalog): a farmer scanning their own listings needs date-added, a status
// badge, and a denser row layout, none of which belong on the buyer-facing card.
export default function SellerProductCard({ product, actions }) {
  const outOfStock = Number(product.quantity) <= 0;
  const expiryStatus = getExpiryStatus(product.expirationDate);

  return (
    <article className="seller-product-card">
      <div className="seller-product-row">
        <Link to={`/products/${product.id}`} className="seller-product-image">
          {product.image ? <img src={product.image} alt={product.name} /> : <Package size={30} />}
        </Link>

        <div className="seller-product-main">
          <div className="seller-product-top">
            <h3>{titleCase(product.name)}</h3>
            <div className="seller-product-badges">
              <span className="category-pill">{product.category}</span>
              <span className={`badge badge-grade-${(product.grade || 'A').toLowerCase()}`}>Grade {product.grade || 'A'}</span>
              {product.sellingType === 'wholesale' ? <span className="badge badge-wholesale">Wholesale</span> : null}
              {product.discountPercent ? <span className="badge badge-sale">-{product.discountPercent}%</span> : null}
              {!outOfStock && isLowStock(product.quantity) ? <span className="badge badge-low-stock">Low stock</span> : null}
              {outOfStock ? <span className="badge badge-out-of-stock">Out of stock</span> : null}
              {expiryStatus === 'expiring_soon' ? <span className="badge badge-expiring-soon">Expiring soon</span> : null}
              {expiryStatus === 'expired' ? <span className="badge badge-expired">Expired</span> : null}
              <StatusBadge value={product.status} />
            </div>
          </div>

          <div className="seller-product-meta">
            <span><MapPin size={14} /> {product.location}</span>
            <span><Package size={14} /> {product.quantity} {product.unit} available</span>
            <span><Calendar size={14} /> Added {formatDate(product.createdAt)}</span>
            {product.expirationDate ? <span><Clock size={14} /> Expires {formatDate(product.expirationDate)}</span> : null}
          </div>
        </div>

        <div className="seller-product-price">
          {product.discountPercent ? <small className="price-original">{formatCurrency(product.originalPrice)}</small> : null}
          <strong>{formatCurrency(product.price)}</strong>
          <span>per {product.unit}</span>
        </div>
      </div>

      {actions ? <div className="seller-card-actions">{actions}</div> : null}
    </article>
  );
}
