import { ShoppingCart } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useCart } from '../../contexts/CartContext';

// Mirrors NotificationBell's toggle styling (see globals.css's .notification-bell-toggle /
// .notification-badge) so the two icons in the page header read as one consistent pair, not
// two different design languages bolted together.
export default function CartButton() {
  const { itemCount } = useCart();

  return (
    <Link to="/cart" className="cart-button" aria-label="View cart">
      <ShoppingCart size={20} />
      {itemCount > 0 ? <span className="cart-button-badge">{itemCount > 99 ? '99+' : itemCount}</span> : null}
    </Link>
  );
}
