import { Link } from 'react-router-dom';
import { useCart } from '../../contexts/CartContext';
import trolleyIcon from '../../assets/icons/cart-trolley.png';
import './CartButton.css';




export default function CartButton() {
  const { itemCount } = useCart();

  return (
    <Link to="/cart" className="cart-button" aria-label={itemCount > 0 ? `View cart, ${itemCount} ${itemCount === 1 ? 'item' : 'items'}` : 'View cart'} title="View cart">
      <span className="cart-button-icon" style={{ '--cart-icon': `url(${trolleyIcon})` }} aria-hidden="true" />
      {itemCount > 0 ? <span className="cart-button-badge" aria-hidden="true">{itemCount > 99 ? '99+' : itemCount}</span> : null}
    </Link>
  );
}
