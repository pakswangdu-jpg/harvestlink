import { ShoppingCart } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useCart } from '../../contexts/CartContext';




export default function CartButton() {
  const { itemCount } = useCart();

  return (
    <Link to="/cart" className="cart-button" aria-label="View cart">
      <ShoppingCart size={20} />
      {itemCount > 0 ? <span className="cart-button-badge">{itemCount > 99 ? '99+' : itemCount}</span> : null}
    </Link>
  );
}
