import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShoppingCart } from 'lucide-react';
import AppShell from '../../components/layout/AppShell';
import EmptyState from '../../components/common/EmptyState';
import CartItemRow from '../../components/cart/CartItemRow';
import { useAuth } from '../auth/AuthContext';
import { useCart } from '../../contexts/CartContext';
import { getProductById } from '../../services/productService';
import { formatCurrency } from '../../utils/formatters';
import { getNavItemsForRole } from '../../utils/navItemsByRole';
import { getApplicableUnitPrice } from '../../../backend/shared/pricing.js';
import { EXPIRED_PRODUCT_ERROR_CODE, isProductExpired } from '../../utils/constants';




const REFRESH_INTERVAL_MS = 5000;

export default function CartPage() {
  const { currentUser } = useAuth();
  const { items, updateQuantity, removeItem, clearCart } = useCart();
  const navigate = useNavigate();
  const navItems = getNavItemsForRole(currentUser.role);
  const [productsById, setProductsById] = useState({});
  const [expiredById, setExpiredById] = useState({});



  const loading = items.length > 0 && !items.every((item) => item.productId in productsById);

  useEffect(() => {
    if (!items.length) return undefined;
    let cancelled = false;
    let refreshing = false;
    const loadProducts = () => {
      if (refreshing) return;
      refreshing = true;
      Promise.all(items.map((item) => (
        getProductById(item.productId, { fresh: true })
          .then((product) => [item.productId, product, Boolean(product && isProductExpired(product.expirationDate))])
          .catch((error) => [item.productId, null, error?.code === EXPIRED_PRODUCT_ERROR_CODE])
      ))).then((entries) => {
        refreshing = false;
        if (cancelled) return;
        setProductsById(Object.fromEntries(entries.map(([id, product]) => [id, product])));
        setExpiredById(Object.fromEntries(entries.map(([id, , isExpired]) => [id, isExpired])));
      });
    };
    loadProducts();
    const interval = setInterval(loadProducts, REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [items]);




  useEffect(() => {
    items.forEach((item) => {
      const product = productsById[item.productId];
      if (product && product.quantity > 0 && item.quantity > product.quantity) {
        updateQuantity(item.productId, product.quantity, product.quantity);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productsById]);

  const availableItems = items.filter((item) => {
    const product = productsById[item.productId];
    return product && product.quantity > 0 && product.status === 'active' && !expiredById[item.productId] && !isProductExpired(product.expirationDate);
  });
  const total = availableItems.reduce((sum, item) => {
    const product = productsById[item.productId];
    return sum + getApplicableUnitPrice(product, item.quantity) * item.quantity;
  }, 0);

  return (
    <AppShell
      user={currentUser}
      navItems={navItems}
      title="My Cart"
      subtitle="Review your items before proceeding to checkout."
    >
      {!loading && !items.length ? (
        <EmptyState
          icon={ShoppingCart}
          title="Your cart is empty"
          message="Browse the marketplace and add products you'd like to order."
          actionLabel="Go to Marketplace"
          onAction={() => navigate('/marketplace')}
        />
      ) : (
        <section className="content-grid two cart-split">
          <div className="panel cart-items-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Items</p>
                <h2>{items.length} {items.length === 1 ? 'item' : 'items'} in your cart</h2>
              </div>
              {items.length ? (
                <button type="button" className="btn btn-secondary btn-sm" onClick={clearCart}>Clear cart</button>
              ) : null}
            </div>
            <div className="cart-item-list">
              {items.map((item) => (
                <CartItemRow
                  key={item.productId}
                  quantity={item.quantity}
                  product={productsById[item.productId] || null}
                  isExpired={Boolean(expiredById[item.productId])}
                  onUpdateQuantity={(nextQuantity) => {
                    const product = productsById[item.productId];
                    updateQuantity(item.productId, nextQuantity, product?.quantity);
                  }}
                  onRemove={() => removeItem(item.productId)}
                />
              ))}
            </div>
          </div>

          <aside className="panel cart-summary-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Summary</p>
                <h2>Order summary</h2>
              </div>
            </div>
            <div className="cart-summary-line">
              <span>Subtotal ({availableItems.reduce((count, item) => count + item.quantity, 0)} items)</span>
              <strong>{formatCurrency(total)}</strong>
            </div>
            <div className="cart-summary-line muted">
              <span>Delivery fee</span>
              <span>To be calculated</span>
            </div>
            <div className="cart-summary-total">
              <span>Total</span>
              <strong>{formatCurrency(total)}</strong>
            </div>
            <p className="cart-summary-note">
              Each product is checked out individually — select &ldquo;Checkout&rdquo; on an
              item below to enter delivery and payment details for that order.
            </p>
            <Link className="btn btn-secondary btn-md full-width" to="/marketplace">Continue shopping</Link>
          </aside>
        </section>
      )}
    </AppShell>
  );
}
