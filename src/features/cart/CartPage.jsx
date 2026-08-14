import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AppShell from '../../components/layout/AppShell';
import EmptyState from '../../components/common/EmptyState';
import cartEmptyIcon from '../../assets/icons/cart-empty.png';
import CartItemRow from '../../components/cart/CartItemRow';
import { useAuth } from '../auth/AuthContext';
import { useCart } from '../../contexts/CartContext';
import { getProductById } from '../../services/productService';
import { formatCurrency } from '../../utils/formatters';
import { getNavItemsForRole } from '../../utils/navItemsByRole';

// Kept short — this is a live-ness refresh (catching stock/price changes made elsewhere
// while the cart is open), not a real-time channel, matching the poll interval other pages
// in this app already use for the same purpose (Marketplace, NotificationBell).
const REFRESH_INTERVAL_MS = 5000;

export default function CartPage() {
  const { currentUser } = useAuth();
  const { items, updateQuantity, removeItem, clearCart } = useCart();
  const navigate = useNavigate();
  const navItems = getNavItemsForRole(currentUser.role);
  const [productsById, setProductsById] = useState({});
  // Derived, not its own state: "loading" just means "haven't fetched every item currently
  // in the cart yet" — recomputing it from productsById/items avoids a second piece of state
  // that could drift out of sync with the fetch below.
  const loading = items.length > 0 && !items.every((item) => item.productId in productsById);

  useEffect(() => {
    if (!items.length) return undefined;
    let cancelled = false;
    const loadProducts = () => {
      Promise.all(items.map((item) => (
        getProductById(item.productId)
          .then((product) => [item.productId, product])
          .catch(() => [item.productId, null])
      ))).then((pairs) => {
        if (cancelled) return;
        setProductsById(Object.fromEntries(pairs));
      });
    };
    loadProducts();
    const interval = setInterval(loadProducts, REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [items]);

  // A listing's stock can drop below what's already in the cart (another buyer bought it,
  // or the farmer adjusted it) — this clamps the cart down to whatever's actually available
  // instead of letting the buyer "check out" a quantity that no longer exists.
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
    return product && product.quantity > 0 && product.status === 'active';
  });
  const total = availableItems.reduce((sum, item) => sum + Number(productsById[item.productId].price) * item.quantity, 0);

  return (
    <AppShell
      user={currentUser}
      navItems={navItems}
      title="My Cart"
      subtitle="Review your items before proceeding to checkout."
    >
      {!loading && !items.length ? (
        <EmptyState
          iconSrc={cartEmptyIcon}
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
