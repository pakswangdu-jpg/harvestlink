import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import AppShell from '../../components/layout/AppShell';
import CheckoutProgress from '../../components/checkout/CheckoutProgress';
import CheckoutForm from '../../components/forms/CheckoutForm';
import Button from '../../components/common/Button';
import { useAuth } from '../auth/AuthContext';
import { getProductById } from '../../services/productService';
import { createOrder } from '../../services/orderService';
import { ORDERING_ROLES } from '../../utils/constants';
import { getNavItemsForRole } from '../../utils/navItemsByRole';
import { useCart } from '../../contexts/CartContext';

export default function ProductDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser } = useAuth();
  const { removeItem } = useCart();
  const [product, setProduct] = useState(null);
  const [loadedId, setLoadedId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getProductById(id)
      .then((result) => {
        if (cancelled) return;
        setProduct(result);
        setLoadedId(id);
      })
      .catch(() => {
        if (cancelled) return;
        setProduct(null);
        setLoadedId(id);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loadedId !== id) return null;
  if (!product) return <Navigate to="/marketplace" replace />;

  const navItems = getNavItemsForRole(currentUser.role);
  const isPendingReview = product.priceReview?.status === 'pending';
  const isOutOfStock = !(Number(product.quantity) > 0);
  const canRequest = ORDERING_ROLES.includes(currentUser.role)
    && currentUser.id !== product.farmerId
    && product.status === 'active'
    && !isPendingReview
    && !isOutOfStock;

  const handleOrder = async (values) => {
    const order = await createOrder({ ...values, productId: product.id });
    // The order now exists independently of the cart — leaving a checked-out item sitting in
    // the cart would let a buyer "re-order" it by mistake straight from the cart page.
    removeItem(product.id);
    // GCash orders are created pending, same as COD — the demo GCash payment module
    // (src/features/payments/GcashPaymentPage.jsx) is what actually collects "payment" and
    // marks this same order paid, so route there instead of straight to tracking.
    if (order.paymentMethod === 'gcash') {
      navigate(`/orders/${order.id}/pay/gcash`);
      return;
    }
    navigate(`/orders/${order.id}`, { state: { notice: 'Order placed. Track its progress below.' } });
  };

  return (
    <AppShell
      user={currentUser}
      navItems={navItems}
      title="Checkout"
      subtitle="Review your order before placing it."
    >
      {canRequest ? <CheckoutProgress currentStep="checkout" /> : null}
      {canRequest ? (
        <CheckoutForm
          product={product}
          currentUser={currentUser}
          onSubmit={handleOrder}
          initialQuantity={location.state?.quantity ? String(location.state.quantity) : ''}
        />
      ) : (
        <div className="panel">
          <div className="empty-state compact">
            <h3>Order unavailable</h3>
            <p>
              {!ORDERING_ROLES.includes(currentUser.role)
                ? 'Only buyer or partner organization accounts can place orders.'
                : isPendingReview
                  ? 'This listing’s price is still awaiting DTI review and can’t be ordered yet.'
                  : isOutOfStock
                    ? 'This listing is currently out of stock.'
                    : 'You cannot order your own product or an inactive listing.'}
            </p>
            <Link className="btn btn-secondary btn-md" to="/marketplace">Back to marketplace</Link>
          </div>
        </div>
      )}
      <Button variant="ghost" onClick={() => navigate(-1)}>Back</Button>
    </AppShell>
  );
}
