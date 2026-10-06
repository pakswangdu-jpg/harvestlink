import { ShoppingCart } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useCart } from '../../contexts/CartContext';




export default function CartButton() {
  const { itemCount } = useCart();

  return (
    <Link to="/cart" className="cart-button" aria-label={itemCount > 0 ? `View cart, ${itemCount} ${itemCount === 1 ? 'item' : 'items'}` : 'View cart'} title="View cart">
      <ShoppingCart size={20} aria-hidden="true" />
      {itemCount > 0 ? <span className="cart-button-badge" aria-hidden="true">{itemCount > 99 ? '99+' : itemCount}</span> : null}
    </Link>
  );
}
