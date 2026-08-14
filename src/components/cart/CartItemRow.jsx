import { Link } from 'react-router-dom';
import { ArrowRight, MapPin, Sprout, Trash2, User } from 'lucide-react';
import QuantityStepper from '../checkout/QuantityStepper';
import { formatCurrency, formatQuantity, titleCase } from '../../utils/formatters';

// `product` is the live listing fetched fresh from the backend (see CartPage.jsx) — never a
// stale snapshot saved at add-to-cart time, so price/stock/status here are always current.
// `product` is null when the listing was deleted or deactivated since it was added.
export default function CartItemRow({ quantity, product, onUpdateQuantity, onRemove }) {
  if (!product) {
    return (
      <div className="cart-item-row cart-item-unavailable">
        <div className="cart-item-unavailable-info">
          <strong>This listing is no longer available.</strong>
          <p>The farmer may have removed or deactivated it.</p>
        </div>
        <button type="button" className="cart-item-remove" onClick={onRemove} aria-label="Remove from cart">
          <Trash2 size={16} />
        </button>
      </div>
    );
  }

  const inStock = product.quantity > 0 && product.status === 'active';
  const subtotal = Number(product.price) * quantity;

  return (
    <div className="cart-item-row">
      <Link to={`/products/${product.id}`} className="cart-item-image">
        {product.image ? (
          <img src={product.image} alt={product.name} />
        ) : (
          <Sprout size={24} strokeWidth={1.5} />
        )}
      </Link>

      <div className="cart-item-details">
        <Link to={`/products/${product.id}`} className="cart-item-name">{titleCase(product.name)}</Link>
        <div className="cart-item-price">
          {formatCurrency(product.price)} <span>/ {product.unit}</span>
        </div>
        <span className="cart-item-tags">Grade {product.grade || 'A'} · {product.sellingType === 'wholesale' ? 'Wholesale' : 'Retail'}</span>
        {!inStock ? (
          <p className="cart-item-warning">This listing is currently out of stock or inactive.</p>
        ) : null}
      </div>

      <div className="cart-item-meta">
        {product.farmerName ? (
          <div className="cart-item-meta-row">
            <span className="cart-item-meta-label">Farmer</span>
            <span className="cart-item-meta-value"><User size={12} /> {product.farmerName}</span>
          </div>
        ) : null}
        <div className="cart-item-meta-row">
          <span className="cart-item-meta-label">Location</span>
          <span className="cart-item-meta-value"><MapPin size={12} /> {product.location}</span>
        </div>
      </div>

      <div className="cart-item-controls">
        <div className="cart-item-qty-block">
          <span className="cart-item-qty-label">Quantity</span>
          <QuantityStepper
            value={String(quantity)}
            onChange={(value) => onUpdateQuantity(Number(value) || 1)}
            min={1}
            max={product.quantity}
            unit={product.unit}
            disabled={!inStock}
          />
          <span className="cart-item-stock">{formatQuantity(product.quantity)} {product.unit} available</span>
        </div>

        <div className="cart-item-subtotal-block">
          <span className="cart-item-calc">{formatQuantity(quantity)} {product.unit} × {formatCurrency(product.price)}</span>
          <div className="cart-item-subtotal-row">
            <span>Subtotal</span>
            <strong className="cart-item-subtotal">{formatCurrency(subtotal)}</strong>
          </div>
        </div>

        <div className="cart-item-actions">
          <Link
            to={`/products/${product.id}`}
            state={{ quantity }}
            className={`btn btn-primary btn-sm cart-item-checkout${!inStock ? ' btn-disabled' : ''}`}
            aria-disabled={!inStock}
            onClick={(event) => { if (!inStock) event.preventDefault(); }}
          >
            Checkout <ArrowRight size={13} />
          </Link>
          <button type="button" className="cart-item-remove" onClick={onRemove} aria-label="Remove from cart">
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
